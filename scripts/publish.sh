#!/usr/bin/env bash
# ============================================================
# 天启 · Tiaqi 发布脚本（自动化任务共用）
#   1) node scripts/build.mjs  生成静态页
#   2) 通过 GitHub Git Data API 增量提交到 Pages 仓库 → www.tiaqi.com
#
# 为什么不用 git push：沙箱内 github.com 的 git 协议不通，
# 但 REST API（api.github.com）可达，因此走「blob → tree → commit → ref」。
#
# 用法：
#   bash /workspace/scripts/publish.sh            # 构建 + 增量推送（无变更则不提交）
#   bash /workspace/scripts/publish.sh --fetch    # 构建时重新抓取信源再推送
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

# ---- 2. 构建 ----
cd "$SRC"
node scripts/build.mjs $BUILD_ARGS >/tmp/tiaqi-build.log 2>&1 || {
  echo "[失败] build 出错："; tail -20 /tmp/tiaqi-build.log; exit 1; }
echo "[OK] build 完成"

# ---- 3. 收集待发布文件（白名单，排除凭证/截图/设计稿）----
mapfile -t FILES < <(
  {
    for f in index.html about.html style.css feed.xml .nojekyll; do [ -f "$f" ] && echo "$f"; done
    find assets intel fiction motif data content scripts -type f 2>/dev/null
  } | grep -v -E '(^|/)(\.git|\.secrets)/' | grep -v -E '\.(png|jpe?g|gif|zip|pdf)$' | sort -u
)
[ "${#FILES[@]}" -gt 0 ] || { echo "[失败] 没有可发布文件"; exit 1; }

# ---- 4. 远端 tree 现状（path → blob sha）----
REMOTE=$(api "$API/git/trees/${BRANCH}?recursive=1" | jq -r '.tree[] | "\(.path) \(.sha)"' 2>/dev/null || true)

# ---- 5. 对比本地 blob sha，只提交有变化的文件 ----
TMP_TREE="$(mktemp)"
trap 'rm -f "$TMP_TREE"' EXIT
changed=0
for f in "${FILES[@]}"; do
  sha="$(git hash-object -- "$f" 2>/dev/null)" || continue
  if echo "$REMOTE" | awk -v p="$f" -v s="$sha" '$1==p && $2==s {found=1} END{exit !found}'; then continue; fi
  jq -n --arg p "$f" --arg s "$sha" '{path:$p, mode:"100644", type:"blob", sha:$s}' >>"$TMP_TREE"
  changed=$((changed + 1))
done
echo "[信息] 待更新文件数：${changed} / ${#FILES[@]}"
[ "$changed" -eq 0 ] && { echo "[OK] 内容与线上一致，跳过提交"; exit 0; }

# ---- 6. 上传 blob ----
# 说明：GitHub 要求 tree 中引用的 blob 必须已存在于仓库，故先逐个创建（幂等）。
: >"${TMP_TREE}.new"
while read -r -a part; do
  path="${part[0]}"
  b64="$(base64 -w0 "$path")"
  blob="$(api -X POST "$API/git/blobs" --data-binary "$(jq -n --arg c "$b64" '{content:$c,encoding:"base64"}')" | jq -r '.sha')"
  [ -n "$blob" ] && [ "$blob" != "null" ] || { echo "[失败] blob 上传失败：$path"; exit 1; }
  jq -n --arg p "$path" --arg s "$blob" '{path:$p, mode:"100644", type:"blob", sha:$s}' >>"${TMP_TREE}.new"
done < <(jq -r '.path' "$TMP_TREE")
mv "${TMP_TREE}.new" "$TMP_TREE"

# ---- 7. tree → commit → 更新 ref ----
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

echo "[OK] 已提交 ${changed} 个文件 → ${REPO}@${BRANCH} ($(echo "$NEW_COMMIT" | cut -c1-7))"
echo "[OK] 线上地址：https://www.tiaqi.com"
