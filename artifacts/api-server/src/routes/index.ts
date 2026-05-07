import { Router, type IRouter } from "express";
import healthRouter from "./health";
import quotesRouter from "./quotes";
import etfDistributionsRouter from "./etf-distributions";
import historyRouter from "./history";
import chartRouter from "./chart";

const router: IRouter = Router();

router.use(healthRouter);
router.use(quotesRouter);
router.use(etfDistributionsRouter);
router.use(historyRouter);
router.use(chartRouter);

export default router;
