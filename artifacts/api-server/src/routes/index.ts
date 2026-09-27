import { Router, type IRouter } from "express";
import healthRouter from "./health";
import movementRouter from "./movement";

const router: IRouter = Router();

router.use(healthRouter);
router.use(movementRouter);

export default router;
