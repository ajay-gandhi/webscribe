
const express = require("express");
const request = require("request");
const textbelt = require("textbelt");
const Configstore = require("configstore");
const pkg = require("./package.json");
// const Logger = require("../util/logger");

// const LOG = new Logger("webscribe");
const LOG = { log: console.log };
const PORT = process.argv[2] || 9002;

const subscriptions = new Configstore(`${pkg.name}-subscriptions`);
const cache = new Configstore(`${pkg.name}-cache`);

/*********************************** Server ***********************************/

const escape = s => s.replace(/\./g, "\\.");

const app = express();
app.use(express.static(__dirname + "/public"));

app.get("/subscribe", (req, res) => {
  const a = escape(req.query.address);
  const n = req.query.number;

  const subA = subscriptions.get(a);
  subscriptions.set(a, subA && subA.indexOf(n) < 0 ? subA.concat(n) : [n]);
  LOG.log(`New subscription: ${n} on ${a}`);
  toggleDispatcher();
  res.redirect("/index.html");
});

app.get("/unsubscribe", (req, res) => {
  const a = escape(req.query.a);
  const newSubs = subscriptions.get(a).filter(n => n !== req.query.n);
  if (newSubs.length) subscriptions.set(a, newSubs);
  else                subscriptions.delete(a);
  LOG.log(`Subscription removed: ${req.query.n} on ${a}`);
  toggleDispatcher();
  res.redirect("/index.html");
});

app.get("/subscriptions", (req, res) => {
  const sub = subscriptions.all;
  res.end(JSON.stringify(Object.keys(sub).reduce((memo, a) => {
    return memo.concat(sub[a].map(n => ({ a, n })));
  }, [])));
});

app.listen(PORT, () => LOG.log(`Server running on port ${PORT}`));

/********************************* Dispatcher *********************************/

const INTERVAL = 1800000; // 30 minutes

// Enables/disables dispatcher depending on whether there are subscriptions
const toggleDispatcher = () => {
  const sub = subscriptions.all;
  if (Object.keys(sub).length && !dispatcher) {
    LOG.log("New subscription, starting dispatcher");
    dispatcher = setInterval(checkSubscriptions, INTERVAL);
  } else if (!Object.keys(sub).length && dispatcher) {
    LOG.log("No subscriptions, halting dispatcher");
    clearInterval(dispatcher);
    dispatcher = false;
  }
};

// Notify the specified phone numbers that the page at the given address
// has changed
const notify = (address, numbers) => {
  const message = `Webscribe: ${address} has changed`;
  numbers.forEach((n) => {
    textbelt.sendText(n, message);
  });
};

// Iterate over all subscriptions and see if they've changed
// For each subscription, compare page to cached version
const checkSubscriptions = () => {
  const sub = subscriptions.all;
  LOG.log("Checking subscriptions...");

  Object.keys(sub).forEach((address) => {
    request(address, (error, response, body) => {
      if (error) return;

      const a = escape(address);
      if (cache.has(a)) {
        if (cache.get(a) !== body) {
          notify(address, sub[address]);
          cache.set(a, body);
        }
      } else {
        cache.set(a, body);
      }
    });
  });
};

checkSubscriptions();
let dispatcher = setInterval(checkSubscriptions, INTERVAL);
