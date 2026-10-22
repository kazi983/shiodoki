#!/usr/bin/env bash
# Start Shiodoki when the GNOME screen is unlocked and it is not running.
# Runs as the systemd user service shiodoki-relaunch.service.
set -u

APP=/opt/Shiodoki/shiodoki

# Prints one line per signal, e.g.
# /org/gnome/ScreenSaver: org.gnome.ScreenSaver.ActiveChanged (false,)
gdbus monitor --session --dest org.gnome.ScreenSaver --object-path /org/gnome/ScreenSaver |
  while read -r line; do
    [[ $line == *"ActiveChanged (false,)"* ]] || continue
    # Already running (any process of the app, including renderers): nothing to do.
    pgrep -x shiodoki >/dev/null && continue
    # Run it in its own transient unit. A child of this service would share its cgroup and be
    # stopped whenever this service is restarted, stopped or exits.
    systemd-run --user --collect --unit=shiodoki-app --description=Shiodoki \
      "$APP" --ozone-platform=x11
  done
