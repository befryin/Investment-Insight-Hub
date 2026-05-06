import { Router, type IRouter } from "express";
import healthRouter from "./health";
import quotesRouter from "./quotes";
import etfDistributionsRouter from "./etf-distributions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(quotesRouter);
router.use(etfDistributionsRouter);

export default router;
