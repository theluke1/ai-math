import worker from '../worker/ask.js'

export async function onRequest(context) {
  return worker.fetch(context.request, context.env, context)
}
