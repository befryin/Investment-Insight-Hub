import { Router, type IRouter } from "express";
import healthRouter from "./health";
import quotesRouter from "./quotes";
import etfDistributionsRouter from "./etf-distributions";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(quotesRouter);
router.use(etfDistributionsRouter);
router.use(historyRouter);

export default router;
