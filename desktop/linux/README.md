# 自動起動（Linux）

ログイン時と、画面のロックを解除したとき（スリープからの復帰を含む）に、Shiodoki が動いていなければ起動する。
PC ごとに 1 回、下の手順で設定する。

- `shiodoki.desktop`：ログイン時に起動する（GNOME の autostart）
- `shiodoki-relaunch.sh`：ロック解除のシグナル（`org.gnome.ScreenSaver.ActiveChanged(false)`）を待ち、`pgrep -x shiodoki` で見つからなければ起動する
- `shiodoki-relaunch.service`：上のスクリプトを常駐させる systemd の user service

```bash
cd ~/Documents/projects/shiodoki/desktop/linux
cp shiodoki.desktop ~/.config/autostart/
install -D -m 755 shiodoki-relaunch.sh ~/.local/bin/shiodoki-relaunch.sh
cp shiodoki-relaunch.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now shiodoki-relaunch.service
systemctl --user status shiodoki-relaunch.service   # active (running) になっている
```

スクリプトから直接ではなく `systemd-run --user` で起動するのは、Shiodoki を監視の service とは別の unit（cgroup）で動かすため。
直接起動すると、`systemctl --user restart shiodoki-relaunch` などで監視の service を止めたときに、Shiodoki も一緒に止まる。

- ログ：`journalctl --user -u shiodoki-relaunch`（監視）、`journalctl --user -u shiodoki-app`（ロック解除で起動した Shiodoki）
- 止める：`systemctl --user disable --now shiodoki-relaunch.service`
- 開発版（`npm run dev`）はプロセス名が `electron` なので、動いていても見つけられない。開発版を動かしたままロックを解除すると、インストール版も起動しようとして「すでに起動しています」のダイアログが出る。
