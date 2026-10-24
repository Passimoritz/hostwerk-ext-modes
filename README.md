# Modes – Hostwerk extension

Services for one job with one click: “Work” with web server and database, “Minecraft night” with just the server.
Switching starts exactly these services and stops the others – while a mode is active, Hostwerk's autostart follows it.
Optionally a mode brings its own accent colour and its own sidebar.

**Where:** Tasks → Modes, the switch on the overview and at the bottom of the sidebar.

**Data:** stays in Hostwerk's settings (`profiles`) – removing the extension ends the active mode, the modes stay for a
reinstall. API: `GET/POST /api/profiles`, `PUT/DELETE /api/profiles/:id`, `POST /api/profiles/activate`.

Other extensions can ask `ctx.profiles.activeProfile()` (provided as `profiles`).
