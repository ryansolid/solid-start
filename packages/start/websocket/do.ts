import { webSocketHandlers } from "./webSocketHandlers";

export class WebSocketDurableObject {
  storage: DurableObjectStorage;
  dolocation: string;

  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    // We will put the WebSocket objects for each client into `websockets`
    this.storage = state.storage;
    this.dolocation = "";
    this.state = state;

    // this.scheduleNextAlarm(this.storage);
    this.getDurableObjectLocation();
  }

  async fetch(request: Request) {
    // To accept the WebSocket request, we create a WebSocketPair (which is like a socketpair,
    // i.e. two WebSockets that talk to each other), we return one end of the pair in the
    // response, and we operate on the other end. Note that this API is not part of the
    // Fetch API standard; unfortunately, the Fetch API / Service Workers specs do not define
    // any way to act as a WebSocket server today.
    let pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // We're going to take pair[1] as our end, and return pair[0] to the client.
    await this.handleWebSocketSession(request, server);

    // Now we return the other end of the pair to the client.
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleWebSocketSession(request: Request, webSocket: WebSocket) {
    // Accept our end of the WebSocket. This tells the runtime that we'll be terminating the
    // WebSocket in JavaScript, not sending it elsewhere.
    // @ts-ignore
    webSocket.accept();

    const websocketEvent = Object.freeze({ durableObject: this, request, env: {} });

    webSocketHandlers
      .find(h => h.url === new URL(request.url).pathname)
      ?.handler.call(websocketEvent, webSocket, websocketEvent);
  }

  async getDurableObjectLocation() {
    const res = await fetch("https://workers.cloudflare.com/cf.json");
    const json = (await res.json()) as IncomingRequestCfProperties;
    this.dolocation = `${json.city} (${json.country})`;
  }
}
