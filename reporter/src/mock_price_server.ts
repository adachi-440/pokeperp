import http from 'node:http';

// シンプルなモック価格サーバー
// - エンドポイント: GET /price -> { price: number }
// - ベース価格にノイズを加えて擬似変動

const PORT = Number(process.env.MOCK_PORT ?? '8787');
let base = Number(process.env.MOCK_BASE ?? '3000');
let tick = 0;

const server = http.createServer((req, res) => {
  if (!req.url) return;
  if (req.method === 'GET' && req.url.startsWith('/price')) {
    // 疑似価格: base ± 少しの変動
    tick += 1;
    const noise = Math.sin(tick / 10) * 2 + (Math.random() - 0.5);
    const price = Math.max(1, base + noise);

    const body = JSON.stringify({ price });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(body);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Mock price server listening on http://localhost:${PORT}/price`);
});

