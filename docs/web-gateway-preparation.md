# 新Webへの中継準備（TASK-20260923-002）

一般公開の切替は未許可。既存 `vercel.json` と `index.html` はそのまま配備し、新Web導線は既定OFFにする。別の生成物でのみ、入口HTML改名と中継設定、短縮リンクのWeb着地を確認できる。生成は配備ではない。中継元と中継先の両住所は必須引数で、推測した既定値は持たない。

```text
既存入口
├─ 現行配備: 既存HTML / アプリ起動 / アンケート / 共有カード
└─ 確認候補: HTMLをlink.htmlへ改名 + 確認済み中継元の予約外を新Webへ中継
   ├─ 予約経路: API / 関連付け / アプリ戻り / 短縮URL / アンケート / 診断 / 既存画像等
   └─ Webで見る: 検証済みゲーム・ログ・利用者・ベスト・ランキング・カタログのみ
```

## 編集前の対応表

| 要件 | 踏襲元 / 到達と成功証跡 | 再利用 / 意図的差分 | 差分の確認 |
|---|---|---|---|
| 短縮URLを安全に解決 | `assets/link-routing.mjs` の `resolveShortLink` / `canonicalTargetFromPath`、main `97c5fa1` の `/s/:code` 配信。先行公開HTTP監査では同一サイトAPIの不正code JSON404、既存 routing tests 合格 | status/code/type/path一致、16字code、bigint/UUID、no-store、任意absolute URL非信用をそのまま使用。PCだけ有効化時に固定Web originへ | 実Chromeと実ローカルHTTPの解決・遷移、悪意URL・不一致・404・500 |
| iPhone手動起動 / Android起動 | `assets/app.mjs` `manualHrefForCanonical` と `openCanonicalTarget`、mainに含まれ既存entrypoint tests合格。実機起動成功は今回未確認 | 手動別host / scheme / timeoutはそのまま、Web閲覧ボタンだけ追加候補 | モバイルUAでブラウザのボタン・URL・アプリ起動要求を確認。OS実機は公開前に別途 |
| 既存予約経路 | `vercel.json`、`docs/survey-runbook.md:17`、公開HTTP監査26経路（先行app release-readiness文書）。既存static/server tests合格 | 全API、既存assets、関連付け、a、s、surveys、旧Steam、診断を中継対象から外す | 生成設定の境界テスト / 関連付けbyte一致。Vercel実配備で再検証必須 |
| ホームと共有カードHTML | `index.html` / `api/share-preview.mjs:12` / `functions.includeFiles`。本番ホームHTML GET200実測、既存share-preview tests | 確認生成物だけ全参照を同時にlink.htmlへ変更。元HTMLとconfigは変更しない | index不在、includeFiles/読込/rewrite整合、元ファイル同一 |
| 新Webのorigin / cookie / 保存 | app `web/src/app/auth/callback/route.ts` / `web/src/proxy.ts`、STG直アクセスは検証済 | 本実装では変更しない。中継越し実origin・cookie・Server Actionの安全性は未確認 | 限定された実Vercel環境でGoogle/Apple/Steam/保存/別利用者cache隔離が必須 |

探索: `rg` でentrypoint/rewrites/template/HTTP/browser例を確認。`git log -S 'canonical' -- assets/link-routing.mjs` は `d0c6d88` と `5a3baff`、`git log -S 'index.html' -- vercel.json` は `d0c6d88` / `3fe08ba` / `5a3baff` を確認。既存ブラウザHTTP試験は `tests/survey-v6-visual.test.mjs`、実HTTP upstream試験は `tests/share-preview.test.mjs` を踏襲する。関連appのrelease-readiness文書も全文確認。

## 現行の公式契約と実測の限界

2026-10-02閲覧: [Vercel rewrites](https://vercel.com/docs/routing/rewrites)、[vercel.json](https://vercel.com/docs/project-configuration/vercel-json)。静的ファイルがrewriteより先に返るためindex改名が必要。`has` 条件は `vercel dev` で未対応と明記されている。ローカルの設定テストはVercelの実ルーティングを証明しない。外部中継には元host/protocolのforwarded headerが付くが、それでNextの認証/保存が成功するとは扱わない。候補には中継のcache opt-outを付けるが、実際のcache隔離も別確認する。

## 配備までの工程

1. Agent: 既定OFFの追加コードと生成準備をテストしPR化。これのマージで一般公開を切り替えない。
2. Agent: 実在する限定確認project・保護範囲・中継先・hostを確認し、レビュー済み候補を生成。operatorへ住所を推測/JSON編集させない。`--gateway` はHTTPS apexまたは中継先と異なるVercel確認host、`--upstream` は確認済みの別Next住所。旧共有host/iPhone手動host/両者同一/資格情報/非HTTPS/任意パスを拒否する。確認hostのWeb閲覧先は固定STG新Web、apex候補はapex。現在Vercelの実環境権限・確認gateway資源・最終本番中継先は未確認。
3. Agent: 実Vercelで予約経路と3host、実短縮URL・SNSプレビュー、認証cookie・戻り先・保存・cacheを検証。失敗/保護画面/本番書込を要求する場合は停止。
4. operator: PCと実機の最終確認、全機能合格後に一般公開の別承認。不合格ならAgentが修正する。
5. operator: 承認済み手順のみ公開。Agent: read-only監査。関連付け非200/短縮URL/アンケート異常/origin不一致/権限漏れなら停止し旧配備へ戻す。

確認ファイル: app commonrules/task JSON/release-readiness、links AGENTS/CLAUDE/README/vercel/index/routing/app/share-preview、survey runbook、既存static/routing/entrypoint/share-preview/server tests、既存survey-v6ブラウザfixture。AGENTS指定の `docs/00-service-overview.md` / `04-development-workflow.md` / `05-agent-operating-rules.md` は実readで不在だったため読了扱いにしていない。Cloud brokerはdisabledの実返答、今回作業はDBなし。

## 実行結果（2026-10-02）

- `node --test tests/web-gateway.test.mjs tests/web-landing-browser.test.mjs tests/static-config.test.mjs tests/link-routing.test.mjs tests/app-entrypoint.test.mjs tests/server-security.test.mjs tests/share-preview.test.mjs`: 63 tests / 63 pass / 0 fail / 0 skipped。ブラウザ試験の内部確認は21件。実Chrome＋実ローカルHTTPで既定OFF、PC短縮の固定Web着地/正確なlogId、resolver cookie非送信、iPhone別host手動リンク/Androidscheme/狭い画面、診断とAI戻りを除外、404/503/悪意URL/type不一致の停止を確認した。resolverはfixtureであり、実EF・OSアプリ起動・Vercel中継は未確認。
- 生成先のsymlink aliasがcheckout内部を指す場合は作成前に拒否。実aliasで非作成を回帰確認。既存outputはEEXISTで停止し上書き/削除しない。
- 実在するapexを中継元、STG新Webを中継先と明示したコード確認候補を `/tmp/pn-links-gateway-candidate-ff4255e0-v2` に実生成。index不在/改名参照/includeFiles整合、アプリ関連付けbyte一致、元index/configが不変、環境/資格情報/node_modules/git非コピーを確認。生成物は未配備、本番切替用として承認されていない。単体試験の `fixture-gateway.vercel.app` は架空のテスト値であり実在projectの証拠ではない。apexとfixture確認hostの両方でrewrite/headerのhost条件が要求値と一致することを確認した。
- `git diff --check` と `git diff --exit-code -- index.html vercel.json api/share-preview.mjs .well-known/apple-app-site-association .well-known/assetlinks.json` はexit 0。現行の配備設定・HTML・関連付け・共有カード読込は不変。

初回ブラウザ試験ではモバイルUAの既存scheme起動がChrome外部プロトコル表示を待ち、network load待ちがtimeoutした。試験をcommit到達＋実DOM表示待ちへ変更して再確認した。実機アプリ起動を抑止/改変して通したものではない。

確認gatewayでも既存の `/api/share-links/:code` は本番3host限定のまま。他hostのresolverは安全な無効応答になるため、実短縮URLの確認には別途STG専用resolverの存在・host・契約を調査しレビューする。本番EFの許可hostを勝手に増やさない。アンケートAPIも既存origin/DBの固定組合せを維持しており、任意確認hostでのログイン/投稿が通るとは扱わない。この生成だけで全経路が実確認できるとは報告しない。
