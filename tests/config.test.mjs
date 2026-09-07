import assert from "node:assert/strict";
import test from "node:test";

import { getConfig, getProviderConfig } from "../api/_lib/config.mjs";

const PRODUCTION_SUPABASE_URL = "https://irbtguncoatqfikctreq.supabase.co";
const STAGING_SUPABASE_URL = "https://wffhdhdxdrmobgojxddo.supabase.co";

function withConfigEnvironment(webOrigin, callback, supabaseUrl = STAGING_SUPABASE_URL) {
  const names = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "PLAYNAVI_WEB_ORIGIN"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  process.env.PLAYNAVI_WEB_ORIGIN = webOrigin;
  try {
    return callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

function withAppleEnvironment(values, callback) {
  const names = [
    "APPLE_WEB_SERVICES_ID",
    "APPLE_TEAM_ID",
    "APPLE_WEB_KEY_ID",
    "APPLE_WEB_PRIVATE_KEY",
    "APPLE_WEB_CLIENT_SECRET",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, values);
  try {
    return callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("accepts only a PlayNavi-controlled Web origin", () => {
  withConfigEnvironment("https://survey-stg.playnavilab.com", () => {
    assert.equal(getConfig().webOrigin, "https://survey-stg.playnavilab.com");
    assert.equal(getConfig().functions.guestSessionCreate, "survey-guest-session-create");
  });

  for (const unmanagedOrigin of [
    "https://playnavi-links-git-survey.example.vercel.app",
    "https://survey-stg.playnavilab.com.example.com",
    "https://survey-stg.playnavilab.com:8443",
  ]) {
    withConfigEnvironment(unmanagedOrigin, () => {
      assert.throws(() => getConfig(), /PlayNavi-controlled https origin/);
    });
  }
});

test("accepts only the reviewed Web origin and Supabase project pairs", () => {
  for (const [webOrigin, supabaseUrl] of [
    ["https://links.playnavilab.com", PRODUCTION_SUPABASE_URL],
    ["https://survey-stg.playnavilab.com", STAGING_SUPABASE_URL],
  ]) {
    withConfigEnvironment(webOrigin, () => {
      assert.equal(getConfig().supabaseUrl, supabaseUrl);
    }, `${supabaseUrl}/`);
  }

  for (const [webOrigin, supabaseUrl] of [
    ["https://links.playnavilab.com", STAGING_SUPABASE_URL],
    ["https://survey-stg.playnavilab.com", PRODUCTION_SUPABASE_URL],
    ["https://survey-stg.playnavilab.com", `${STAGING_SUPABASE_URL}/rest/v1`],
    ["https://survey-stg.playnavilab.com", "https://unreviewed-project.supabase.co"],
  ]) {
    withConfigEnvironment(webOrigin, () => {
      assert.throws(
        () => getConfig(),
        /SUPABASE_URL does not match the approved project/,
      );
    }, supabaseUrl);
  }
});

test("rejects unapproved PlayNavi subdomains even with an approved project", () => {
  withConfigEnvironment("https://survey-preview.playnavilab.com", () => {
    assert.throws(
      () => getConfig(),
      /PLAYNAVI_WEB_ORIGIN is not an approved Survey deployment origin/,
    );
  });
});

test("accepts Apple signing material and normalizes Windows line endings", () => {
  withAppleEnvironment({
    APPLE_WEB_SERVICES_ID: "com.playnavilab.playnavi.survey.stg",
    APPLE_TEAM_ID: "9GSX6744M2",
    APPLE_WEB_KEY_ID: "A1B2C3D4E5",
    APPLE_WEB_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\r\ntest-key-material\r\n-----END PRIVATE KEY-----\r\n",
  }, () => {
    assert.deepEqual(getProviderConfig("apple"), {
      clientId: "com.playnavilab.playnavi.survey.stg",
      teamId: "9GSX6744M2",
      keyId: "A1B2C3D4E5",
      privateKey: "-----BEGIN PRIVATE KEY-----\ntest-key-material\n-----END PRIVATE KEY-----",
    });
  });
});

test("rejects fixed Apple client secrets and malformed signing material", () => {
  withAppleEnvironment({
    APPLE_WEB_SERVICES_ID: "com.playnavilab.playnavi.survey.stg",
    APPLE_WEB_CLIENT_SECRET: "retired-fixed-jwt",
  }, () => {
    assert.throws(() => getProviderConfig("apple"), /APPLE_TEAM_ID/);
  });

  const valid = {
    APPLE_WEB_SERVICES_ID: "com.playnavilab.playnavi.survey.stg",
    APPLE_TEAM_ID: "9GSX6744M2",
    APPLE_WEB_KEY_ID: "A1B2C3D4E5",
    APPLE_WEB_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\ntest-key-material\n-----END PRIVATE KEY-----",
  };
  for (const [name, value, expected] of [
    ["APPLE_TEAM_ID", "short", /APPLE_TEAM_ID/],
    ["APPLE_WEB_KEY_ID", "short", /APPLE_WEB_KEY_ID/],
    ["APPLE_WEB_PRIVATE_KEY", "not-a-private-key", /APPLE_WEB_PRIVATE_KEY/],
  ]) {
    withAppleEnvironment({ ...valid, [name]: value }, () => {
      assert.throws(() => getProviderConfig("apple"), expected);
    });
  }
});
