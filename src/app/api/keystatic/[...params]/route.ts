// App Router 必须用 route-handler 入口（Request → Response）；
// @keystatic/next/api 的 makeAPIRouteHandler 是 Pages Router 的 (req, res) 风格，接进 App Router 会导致 405
import { makeRouteHandler } from '@keystatic/next/route-handler';
import config from '../../../../../keystatic.config';

export const { GET, POST } = makeRouteHandler({ config });
