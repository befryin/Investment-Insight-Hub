import { Router, type IRouter } from "express";
import healthRouter from "./health";
import quotesRouter from "./quotes";
import historyRouter from "./history";
import chartRouter from "./chart";
import proxyRouter from "./proxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(quotesRouter);
router.use(proxyRouter);
router.use(historyRouter);
router.use(chartRouter);

export default router;