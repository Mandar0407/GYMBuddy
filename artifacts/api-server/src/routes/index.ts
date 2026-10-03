import { Router, type IRouter } from "express";
import healthRouter from "./health";
import movementRouter from "./movement";
import journalRouter from "./journal";
import foodRouter from "./food";

const router: IRouter = Router();

router.use(healthRouter);
router.use(movementRouter);
router.use(journalRouter);
router.use(foodRouter);

export default router;
