// GET /health — liveness + database check.
// GET /docs (Swagger UI) and /openapi.json — the API contract from docs/openapi.yaml.
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { ApiError } from '../DTO/ApiError.js';
import { checkHealth } from '../Services/health.service.js';

export const systemController = Router();

systemController.get('/health', async (_req, res) => {
  try {
    res.json(await checkHealth());
  } catch (err) {
    console.error('health check failed:', err.message);
    res.status(503).json({ ok: false, error: 'database unreachable' });
  }
});

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Call after every controller is mounted. Compares each operation in the
// spec with the routes Express actually has, then:
//   • marks the ones not built yet in Swagger UI,
//   • answers them with 501 not_implemented instead of a bare 404,
//   • serves the spec at /openapi.json and Swagger UI at /docs.
// "Try it out" calls this same server, so logging in from Swagger sets the
// session cookie and the endpoints that need a login work straight after.
export function connectSwagger(app) {
  const spec = YAML.parse(readFileSync(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8'));
  spec.servers = [{ url: '/', description: 'This server' }];

  const missing = [];
  let built = 0;
  for (const [path, item] of Object.entries(spec.paths)) {
    // A concrete path to test the routers with: /contest/{id}/review → /contest/1/review
    const sample = path.replace(/\{[^}]+\}/g, '1');
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      if (hasRoute(app.router.stack, sample, method)) { built++; continue; }
      op.summary = `🚧 Not built yet · ${op.summary || ''}`;
      op.description = '**Not built yet.** The server answers `501 not_implemented`.\n\n' + (op.description || '');
      missing.push({ method, match: new RegExp('^' + path.replace(/\{[^}]+\}/g, '[^/]+') + '/?$') });
    }
  }
  spec.info.description = `**${built} of ${built + missing.length} endpoints are built.** ` +
    'Ones marked 🚧 answer `501`.\n\n' + spec.info.description;

  app.use((req, _res, next) => {
    const hit = missing.some(m => m.method === req.method.toLowerCase() && m.match.test(req.path));
    next(hit ? new ApiError(501, 'not_implemented', 'This endpoint is in the spec but not built yet.') : undefined);
  });
  app.get('/openapi.json', (_req, res) => res.json(spec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'careerAPI docs',
    swaggerOptions: { withCredentials: true, displayRequestDuration: true, tryItOutEnabled: true },
  }));
  console.log(`swagger: ${built} endpoints built, ${missing.length} not built yet`);
}

// Does any route in this router stack (or a router mounted inside it)
// handle `method path`? Middleware-only layers don't count.
function hasRoute(stack, path, method) {
  for (const layer of stack) {
    if (!layer.match(path)) continue;
    if (layer.route) {
      if (layer.route.methods[method] || layer.route.methods._all) return true;
    } else if (layer.handle && Array.isArray(layer.handle.stack)) {
      const rest = path.slice(layer.path.length) || '/';
      if (hasRoute(layer.handle.stack, rest, method)) return true;
    }
  }
  return false;
}
