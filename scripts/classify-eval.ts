import { classify } from "../lib/agents";

const cases: [string, string][] = [
  ["Not interested, take me off your list.", "opt_out"],
  ["Please stop emailing me.", "opt_out"],
  ["Unsubscribe.", "opt_out"],
  ["Remove me from your list.", "opt_out"],
  ["Do not contact me again.", "opt_out"],
  ["My lawyer will be in touch.", "complaint"],
  ["I will file a complaint.", "complaint"],
  ["I am reporting this to the FTC.", "complaint"],
  ["Are you a bot?", "bot"],
  ["Is this an AI?", "bot"],
  ["Am I talking to a human or a bot?", "bot"],
  ["How much does this cost per month?", "price"],
  ["What's your pricing?", "price"],
  ["What are your fees?", "price"],
  ["Can you share your rates?", "price"],
  ["What's the retainer?", "price"],
  ["Sounds good - Thursday at 2pm works.", "booking"],
  ["Tuesday at 10am is fine.", "booking"],
  ["Book it.", "booking"],
  ["Send me an invite.", "booking"],
  ["Friday works for me.", "booking"],
  ["Sounds good, tell me more.", "interested"],
  ["I'm interested.", "interested"],
  ["Happy to chat.", "interested"],
  ["Can you send more information?", "interested"],
  ["Talk to my controller.", "referral"],
  ["Reach out to my partner.", "referral"],
  ["We already have a bookkeeper in-house.", "objection"],
  ["It's too expensive.", "objection"],
  ["Not now, too busy.", "objection"],
];

let correct = 0;
const misses: string[] = [];
for (const [text, want] of cases) {
  const got = classify(text).cls;
  if (got === want) correct++;
  else misses.push(`${got} != ${want}: ${text}`);
}
console.log(`${correct}/${cases.length} correct`);
console.log(misses.join("\n"));
