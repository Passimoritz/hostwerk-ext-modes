'use strict';
/*
 * Native part of "Modes":
 *   provides "profiles" – Hostwerk's autostart asks profiles.activeProfile() and starts exactly the services of the
 *                         active mode (without this extension the single autostart switches apply).
 *   /api/profiles …     – same addresses as when modes were built in, so existing modes keep working unchanged.
 * Removing the extension ends the active mode (accent colour, sidebar and autostart are Hostwerk's own again); the modes
 * themselves stay in the settings and come back with a reinstall.
 */
const { Modes } = require('./profiles');

let modes = null;

function activate(host) {
  modes = new Modes(host);
  host.provide('profiles', modes);
  modes.routes(host.router);
}

function uninstall() { if (modes) modes.release(); }

function deactivate() { modes = null; }

module.exports = { activate, deactivate, uninstall, Modes };
