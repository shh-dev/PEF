// 휴대폰 손가락 점검 시험용 작은 서버: 일부러 깨진 화면(/bad)과 멀쩡한 화면(/good)
import { createServer } from 'node:http';

const HEAD = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>t</title>';
const GOOD = `${HEAD}</head><body style="margin:0;font:16px sans-serif">
<main><h1>좋은 화면</h1><a href="/bad">나쁜 화면</a>
<form><input name="email" style="width:90%;height:44px"><button style="min-height:44px;min-width:88px">보내기</button></form>
${'<p>내용이 길어서 아래로 내려가야 합니다.</p>'.repeat(60)}
<button id="o" style="min-height:44px">자세히 보기</button>
<div id="m" role="dialog" aria-label="안내" style="display:none;position:fixed;inset:10% 5%;background:#fff;border:1px solid #000;overflow:auto"><button style="min-height:44px">닫기</button>${'<p>안내 문구</p>'.repeat(40)}</div>
<script>document.getElementById('o').onclick=()=>{document.getElementById('m').style.display='block'}</script>
</main></body></html>`;
// 깨진 점: 손가락으로 안 내려감(body overflow hidden), 넓은 콘텐츠, 화면 밖 버튼, 작은 버튼,
// 화면 아래에 고정된 입력 시트(키보드에 가림), 화면보다 길고 스크롤 없는 팝업(닫기 버튼이 화면 밖)
const BAD = `${HEAD}</head><body style="margin:0;overflow:hidden;height:100vh;font:16px sans-serif">
<div style="height:2000px;width:600px;background:#eef">
<h1>나쁜 화면</h1>
<button id="o" style="min-height:44px">자세히 보기</button>
<button style="position:absolute;left:340px;top:100px;min-height:44px">잘리는 버튼</button>
<button style="width:10px;height:10px;padding:0">.</button>
</div>
<form style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:8px"><input name="memo" style="width:90%;height:44px"><button style="min-height:44px">저장</button></form>
<div id="m" role="dialog" aria-label="긴 팝업" style="display:none;position:fixed;top:20px;left:10px;width:340px;height:2000px;background:#fff;border:1px solid #000"><div style="height:1800px">긴 내용</div><button style="position:absolute;top:1900px">닫기</button></div>
<script>document.getElementById('o').onclick=()=>{document.getElementById('m').style.display='block'}</script>
</body></html>`;

export function startServer(port = 0) {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(req.url.startsWith('/bad') ? BAD : GOOD);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1]?.endsWith('touch-server.mjs')) {
  const s = await startServer(Number(process.argv[2]) || 8801);
  console.log(`http://127.0.0.1:${s.address().port}`);
}
