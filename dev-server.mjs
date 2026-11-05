// 로컬에서 Vercel 환경(/api/dust 및 정적 파일 호스팅)을 그대로 재현하는 간이 개발 서버입니다.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 파일 파싱 및 process.env 주입
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const firstEqual = trimmed.indexOf('=');
            if (firstEqual !== -1) {
                const key = trimmed.slice(0, firstEqual).trim();
                const value = trimmed.slice(firstEqual + 1).trim();
                process.env[key] = value;
            }
        }
    });
}

// MIME 타입 매핑 테이블
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

// api/dust.js 핸들러 동적 import
const { default: dustHandler } = await import('./api/dust.js');

const PORT = 3000;

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // /api/dust 요청 처리 (Vercel req/res 호환 어댑터)
    if (pathname === '/api/dust') {
        const query = Object.fromEntries(parsedUrl.searchParams.entries());
        const mockReq = {
            query,
            method: req.method,
            headers: req.headers
        };
        const mockRes = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                res.writeHead(this.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(data));
            }
        };

        try {
            await dustHandler(mockReq, mockRes);
        } catch (err) {
            console.error('Serverless Handler Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, message: err.message }));
        }
        return;
    }

    // 정적 파일 서빙 (index.html, style.css, app.js 등)
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const resolvedPath = path.join(__dirname, filePath);

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(resolvedPath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Dust dev server running at http://localhost:${PORT}`);
});

