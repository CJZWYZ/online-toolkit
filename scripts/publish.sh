#!/usr/bin/env bash
# ============================================================
# 天启 · Tiaqi 发布脚本（唯一构建口，自动化任务共用）
#   1) node scripts/build.mjs  本地生成静态页
#   2) 通过 GitHub Git Data API 增量提交到 Pages 仓库 → www.tiaqi.com
#
# 为什么不用 git push：沙箱内 github.com 的 git 协议不通，
# 但 REST API（api.github.com）可达，因此走「blob → tree → commit → ref」。
#
# 用法：
#   bash /workspace/scripts/publish.sh            # 构建 + 增量推送（无变更则不提交）
#   bash /workspace/scripts/publish.sh --fetch    # 构建时重新抓取信源再推送
#
# 删除远端文件：把路径逐行写进 scripts/publish.deletions，推送成功后自动清空。
#
# 环境变量：TIAQI_REPO（默认 CJZWYZ/online-toolkit）、TIAQI_BRANCH（默认 main）、
#           TIAQI_TOKEN_FILE（默认 /workspace/.secrets/github_token）
# ============================================================
set -euo pipefail

REPO="${TIAQI_REPO:-CJZWYZ/online-toolkit}"
BRANCH="${TIAQI_BRANCH:-main}"
TOKEN_FILE="${TIAQI_TOKEN_FILE:-/workspace/.secrets/github_token}"
SRC="/workspace"
API="https://api.github.com/repos/${REPO}"
BUILD_ARGS="--no-fetch"
[ "${1:-}" = "--fetch" ] && BUILD_ARGS=""

command -v jq >/dev/null || { echo "[失败] 缺少 jq"; exit 1; }

# ---- 1. 凭证 ----
if [ -f "$TOKEN_FILE" ]; then
  TOKEN="$(tr -d ' \t\r\n' < "$TOKEN_FILE")"
else
  TOKEN="$(gh auth token 2>/dev/null || true)"
fi
[ -n "${TOKEN:-}" ] || { echo "[失败] 取不到 GitHub Token：${TOKEN_FILE}"; exit 1; }
api() { curl -s -m 30 -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

# ---- 2. 构建（本地是唯一事实源）----
cd "$SRC"
node scripts/build.mjs $BUILD_ARGS >/tmp/tiaqi-build.log 2>&1 || {
  echo "[失败] build 出错："; tail -20 /tmp/tiaqi-build.log; exit 1; }
echo "[OK] build 完成"

# ---- 3. 收集待发布文件（白名单，排除凭证/截图/设计稿）----
mapfile -t FILES < <(
  {
    for f in index.html about.html style.css feed.xml .nojekyll; do [ -f "$f" ] && echo "$f"; done
    find assets intel fiction motif data content scripts -type f 2>/dev/null
  } | grep -v -E '(^|/)(\.git|\.secrets)/' | grep -v -E '\.(png|jpe?g|gif|zip|pdf)$' \
    | grep -v -E '^scripts/publish\.(deletions|log)$' | sort -u
)
[ "${#FILES[@]}" -gt 0 ] || { echo "[失败] 没有可发布文件"; exit 1; }

# ---- 4. 远端 tree 现状（path → blob sha）----
REMOTE=$(api "$API/git/trees/${BRANCH}?recursive=1" | jq -r '.tree[] | "\(.path) \(.sha)"' 2>/dev/null || true)

# ---- 5. 对比本地 blob sha 挑出变更文件；删除清单单独处理 ----
DEL_FILE="$SRC/scripts/publish.deletions"
UPDATES=()
DELETES=()
for f in "${FILES[@]}"; do
  sha="$(git hash-object -- "$f" 2>/dev/null)" || continue
  if echo "$REMOTE" | awk -v p="$f" -v s="$sha" '$1==p && $2==s {found=1} END{exit !found}'; then continue; fi
  UPDATES+=("$f")
done
if [ -s "$DEL_FILE" ]; then
  while read -r rm_path; do
    [ -n "$rm_path" ] || continue
    if echo "$REMOTE" | awk -v p="$rm_path" '$1==p {found=1} END{exit !found}'; then DELETES+=("$rm_path"); fi
  done < "$DEL_FILE"
fi
echo "[信息] 待更新 ${#UPDATES[@]} / ${#FILES[@]} 个文件，待删除 ${#DELETES[@]} 个"
if [ "${#UPDATES[@]}" -eq 0 ] && [ "${#DELETES[@]}" -eq 0 ]; then
  echo "[OK] 内容与线上一致，跳过提交"; : >"$DEL_FILE"; exit 0
fi

# ---- 6. 上传 blob（GitHub 要求 tree 引用的 blob 已存在于仓库）----
TMP_TREE="$(mktemp)"
trap 'rm -f "$TMP_TREE"' EXIT
: >"$TMP_TREE"
if [ "${#UPDATES[@]}" -gt 0 ]; then
  for path in "${UPDATES[@]}"; do
    blob="$(api -X POST "$API/git/blobs" \
      --data-binary "$(jq -n --arg c "$(base64 -w0 "$path")" '{content:$c,encoding:"base64"}')" | jq -r '.sha')"
    [ -n "$blob" ] && [ "$blob" != "null" ] || { echo "[失败] blob 上传失败：$path"; exit 1; }
    jq -n --arg p "$path" --arg s "$blob" '{path:$p, mode:"100644", type:"blob", sha:$s}' >>"$TMP_TREE"
  done
fi

# ---- 7. tree → commit → 更新 ref（sha:null 的条目表示删除）----
if [ "${#DELETES[@]}" -gt 0 ]; then
  for path in "${DELETES[@]}"; do
    jq -n --arg p "$path" '{path:$p, mode:"100644", type:"blob", sha:null}' >>"$TMP_TREE"
  done
fi
PARENT="$(api "$API/git/ref/heads/${BRANCH}" | jq -r '.object.sha')"
BASE_TREE="$(api "$API/git/commits/${PARENT}" | jq -r '.tree.sha')"
NEW_TREE="$(api -X POST "$API/git/trees" \
  --data-binary "$(jq -n --arg b "$BASE_TREE" --slurpfile t "$TMP_TREE" '{base_tree:$b, tree:$t}')" \
  | jq -r '.sha')"
NEW_COMMIT="$(api -X POST "$API/git/commits" \
  --data-binary "$(jq -n --arg m "publish: $(date '+%Y-%m-%d %H:%M')" --arg t "$NEW_TREE" --arg p "$PARENT" '{message:$m, tree:$t, parents:[$p]}')" \
  | jq -r '.sha')"
UPDATED="$(api -X PATCH "$API/git/refs/heads/${BRANCH}" \
  --data-binary "$(jq -n --arg s "$NEW_COMMIT" '{sha:$s, force:false}')" | jq -r '.object.sha // empty')"
[ -n "$UPDATED" ] || { echo "[失败] 更新分支失败"; exit 1; }

: >"$DEL_FILE"
echo "[OK] 提交 ${#UPDATES[@]} 个文件、删除 ${#DELETES[@]} 个 → ${REPO}@${BRANCH} ($(echo "$NEW_COMMIT" | cut -c1-7))"
echo "[OK] 线上地址：https://www.tiaqi.com"
