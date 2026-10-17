#!/usr/bin/env bash
# Tes cepat sumber Anichin. Jalankan: bash reference/quicktest.sh
# Butuh: curl + node (untuk parse JSON).
set -u
B="https://miniapp.anichin.bio/api"
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'
AH=(-H "User-Agent: $UA" -H "Referer: https://miniapp.anichin.bio/" -H "Origin: https://miniapp.anichin.bio")

jq_len () { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log((j.items||j.rows||[]).length)}catch(e){console.log('ERR')}})"; }

echo "== visible sources =="
curl -s "$B/docs/visible-sources"; echo

for s in dramabox reelshort shortmax goodshort netshort melolo flickreels freereels; do
  echo; echo "== $s =="
  n=$(curl -s -A "$UA" "$B/$s/trending" | jq_len)
  echo "  trending items: $n"
  id=$(curl -s -A "$UA" "$B/$s/trending" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const x=(j.items||j.rows||[])[0];console.log(x?(x.id||x.dramaId):'')}catch(e){console.log('')}})")
  if [ -n "$id" ]; then
    echo "  episode(id=$id, ep=1):"
    curl -s "${AH[@]}" "$B/$s/episode?id=$id&ep=1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log('    videoUrl:',(j.videoUrl||'').slice(0,90));console.log('    locked:',j.locked,'| qualities:',(j.qualityList||[]).map(q=>q.label).join('/'))}catch(e){console.log('    err')}})"
  fi
done

echo; echo "== open-source check: ReelShort scrape =="
BID=$(curl -s -A "$UA" https://www.reelshort.com/id | grep -oE '"buildId":"[^"]+"' | head -1 | sed 's/.*:"//;s/"//')
echo "  buildId: $BID"
curl -s -A "$UA" "https://www.reelshort.com/_next/data/$BID/id/search.json?keywords=love" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log('  search books:',(j.pageProps.books||[]).length)}catch(e){console.log('  err')}})"

echo; echo "selesai."
