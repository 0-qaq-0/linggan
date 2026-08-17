import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getWorkspace, getWorkspaceMeta, saveWorkspace } from '../services/workspaceStore.js';

const router = Router();

router.use(requireAuth);

router.get('/meta', (req: Request, res: Response) => {
  const meta = getWorkspaceMeta(req.user!.id);
  res.json(meta);
});

router.get('/', (req: Request, res: Response) => {
  const workspace = getWorkspace(req.user!.id);
  res.json({ workspace });
});

router.put('/', (req: Request, res: Response) => {
  const { baseRevision, updatedAt, cards, versions, settings } = req.body as {
    baseRevision?: number;
    updatedAt?: number;
    cards?: Array<Record<string, unknown>>;
    versions?: Array<Record<string, unknown>>;
    settings?: Record<string, unknown>;
  };

  if (typeof baseRevision !== 'number' || typeof updatedAt !== 'number') {
    return res.status(400).json({ error: '缺少 baseRevision 或 updatedAt' });
  }

  const result = saveWorkspace(
    req.user!.id,
    {
      updatedAt,
      cards: Array.isArray(cards) ? cards : [],
      versions: Array.isArray(versions) ? versions : [],
      settings: settings && typeof settings === 'object' ? settings : {},
    },
    baseRevision,
  );

  if ('conflict' in result) {
    return res.status(409).json({
      error: '工作区已在其他设备更新',
      workspace: result.workspace,
    });
  }

  res.json({ workspace: result.workspace });
});

export default router;
