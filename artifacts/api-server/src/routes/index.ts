import { Router, type IRouter } from "express";
import healthRouter from "./health";
import movementRouter from "./movement";
import journalRouter from "./journal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(movementRouter);
router.use(journalRouter);

export default router;
