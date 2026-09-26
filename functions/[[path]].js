import {handleRequest} from '../server/app.js';
export function onRequest({request,env}) { return handleRequest(request,env); }
