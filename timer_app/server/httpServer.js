import path from 'path';
import http from 'http';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

/** @type {Map<string, Uint8Array>} */
const fileCache = new Map();

/** @type {Map<string, Uint8Array>} */
const gzipFileCache = new Map();

// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, HEAD',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
};

const httpServer = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const supportsGzip = acceptEncoding.includes('gzip');
    const response = await serveStaticFile(req, supportsGzip);
    const headers = Object.fromEntries(response.headers);
    const combinedHeaders = { ...headers, ...corsHeaders };

    res.writeHead(response.status, response.statusText, combinedHeaders);
    const body = await response.arrayBuffer();
    res.end(new Uint8Array(body));
});

async function serveStaticFile(req, supportsGzip) {
    const fullUrl = new URL(req.url, `http://${req.headers.host}`);
    let filePath = path.join(import.meta.dir, '..', 'static', fullUrl.pathname);
    if (fullUrl.pathname === '/') {
        filePath = path.join(import.meta.dir, '..', 'static', 'index.html');
    }
    
    try {
        const file = Bun.file(filePath);
        const exists = await file.exists();
        if (!exists) {
            console.error(`File not found: ${filePath}`);
            return new Response("Not Found", { status: 404 });
        }
        
        const relativePath = path.relative(path.join(import.meta.dir, '..'), filePath);
        const cacheControlHeader = {
            "Cache-Control": "public, max-age=14400" // 4 hours in seconds
        };

        if (supportsGzip && gzipFileCache.has(relativePath)) {
            return new Response(gzipFileCache.get(relativePath), {
                headers: {
                    "Content-Type": getMimeType(filePath),
                    "Content-Encoding": "gzip",
                    ...cacheControlHeader
                }
            });
        } else if (fileCache.has(relativePath)) {
            return new Response(fileCache.get(relativePath), {
                headers: {
                    "Content-Type": getMimeType(filePath),
                    ...cacheControlHeader
                }
            });
        }

        const content = await file.arrayBuffer();
        fileCache.set(relativePath, new Uint8Array(content));

        if (supportsGzip) {
            const gzippedContent = await gzip(Buffer.from(content));
            gzipFileCache.set(relativePath, new Uint8Array(gzippedContent));
            return new Response(gzippedContent, {
                headers: {
                    "Content-Type": getMimeType(filePath),
                    "Content-Encoding": "gzip",
                    ...cacheControlHeader
                }
            });
        } else {
            return new Response(content, {
                headers: {
                    "Content-Type": getMimeType(filePath),
                    ...cacheControlHeader
                }
            });
        }
    } catch (error) {
        console.error(`Error serving file ${filePath}:`, error);
        return new Response("Internal Server Error", { status: 500 });
    }
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.m4a': 'audio/mp4',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

export { httpServer };