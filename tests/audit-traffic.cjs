const { campaign, profiles } = require("./helpers/race-campaign.cjs");
let failed = false;
for (const profile of [...profiles, "mixed"]) for (const addedObstacles of [false, true]) {
  const result = campaign({ profile, addedObstacles });
  console.log(JSON.stringify(result));
  // This gate certifies bike spacing, NOT the independent static-obstacle pilot.
  if (result.contacts || !result.unchanged || (!addedObstacles && result.finishers !== 6)) failed = true;
}
if (failed) process.exitCode = 1;
