'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ResumeError } = require('./lib/resume-error');
const { createResumeService } = require('./lib/resume-service');
const root = path.join(__dirname, 'dist');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'
};
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
function createServer({ resumeService = createResumeService() } = {}) {
  const server = http.createServer(async (request, response) => {
    const requestId = randomUUID();
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    let apiPath = false;
    try {
      const port = server.address()?.port, hosts = [`localhost:${port}`, `127.0.0.1:${port}`];
      if (!hosts.includes(request.headers.host)) throw new ResumeError('INVALID_HOST', '仅允许通过本机地址访问。', 403);
      let requestPath;
      try { requestPath = decodeURIComponent(request.url.split('?')[0]); }
      catch { throw new ResumeError('INVALID_URL', '请求地址格式不正确。'); }
      apiPath = requestPath.startsWith('/api/');
      if (apiPath) {
        response.setHeader('Cache-Control', 'no-store');
        const origin = request.headers.origin;
        if ((origin && origin !== `http://${request.headers.host}`) || request.headers['sec-fetch-site'] === 'cross-site') throw new ResumeError('ORIGIN_DENIED', '仅允许本机同源页面调用简历服务。', 403);
        if (requestPath.startsWith('/api/resume/')) return await resumeService.handle(request, response, requestPath);
        throw new ResumeError('NOT_FOUND', '接口不存在。', 404);
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new ResumeError('METHOD_NOT_ALLOWED', '静态资源仅支持 GET 或 HEAD。', 405);
      const relativePath = requestPath === '/' ? '/index.html' : requestPath, filePath = path.resolve(root, `.${relativePath}`);
      if (!filePath.startsWith(root + path.sep)) throw new ResumeError('FORBIDDEN', 'Forbidden', 403);
      const realPath = await fs.realpath(filePath);
      if (!realPath.startsWith(root + path.sep)) throw new ResumeError('FORBIDDEN', 'Forbidden', 403);
      const content = await fs.readFile(realPath);
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(realPath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      const known = error instanceof ResumeError;
      const status = known ? error.status : error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500;
      const code = known ? error.code : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR';
      const message = known ? error.message : status === 404 ? 'Not found' : '服务处理失败，请重试。';
      if (status >= 500) console.warn(`[resume:${requestId}] ${code}`);
      request.resume();
      if (apiPath) json(response, status, { error: { code, message }, requestId });
      else { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(message); }
    }
  });
  server.requestTimeout = 330000;
  return server;
}
if (require.main === module) {
  const port = Number(process.env.PORT || 4174), server = createServer();
  server.listen(port, '127.0.0.1', () => console.log(`简历专家运行于 http://localhost:${port}/`));
}
module.exports = { createServer };
