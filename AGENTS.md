<!-- dev-bridge:managed:start (rendered by cli/bridge_repo_docs.py — この区間は手で編集しない) -->
# Agent Instructions — playnavi-links (playnavi)

このリポジトリは Dev Bridge の service profile `playnavi` の管理下にあります。
Bridge から起動された Agent は、作業開始時に**必ず次の順で**読んでください。

1. `./AGENTS.md`（このファイル）
2. `./CLAUDE.md`（このリポの作業規律）
3. `.bridge-tasks/orchestrator-rules.md`（Bridge 共通ルール。task worktree に毎回コピーされる正本のスナップショット。Bridge checkout の固定パスを直接参照しない）
4. `DEV_BRIDGE_TASK_FILE` が示す task JSON（今回の依頼・イベント種別・agent 割当）
5. `docs/` 配下でこのリポが正典と定める文書（下の「リポ固有」節を参照）

## 全 profile 共通の絶対ルール

- **推測で実装しない。** 現行ソース・テーブル定義・RPC・型定義・実コマンド出力で確認してから判断する。
- **既存機能を壊さないアドオン方式**で変更する。signature 変更前に呼出側を全検索する。
- **Git の mutation は Bridge 親経由のみ。** stage / commit / push / PR は `python "$DEV_BRIDGE_CONTROL_CLI" git-* / pr-create`。
  protected branch への push、force push、broad staging、`.env` の stage は禁止。
- **Slack の最終回答は Bridge 親が投稿する。** 途中確認だけ `slack-post` を使う。重複投稿しない。
- **denied は仕様。** PreToolUse hook や sandbox に拒否された操作を別手段で迂回しない。
- **報告は実出力で裏を取る。** commit SHA / push 結果 / PR 番号 / テスト結果は control API や実コマンドの返却値だけを使う。

## このリポで使える経路（profile `playnavi` の設定から生成）

| 項目 | 値 |
|---|---|
| repo key | `playnavi_links`（cross-repo 操作の `--repo` に使う） |
| primary app repo | `playnavi_app` |
| profile 内の全リポ | `playnavi_app`, `playnavi_supabase`, `playnavi_batch_gamedata`, `playnavi_social_processor`, `playnavi_links`, `playnavi_bridge` |
| 開発方針 | 設計承認あり（実装前に設計を提示し operator の GO を待つ） |
| クラウド操作 | **STG 直結**。STG project `wffhdhdxdrmobgojxddo` に対して psql / supabase CLI / Management API を Agent 自身が実行できる（`PLAYNAVI_STG_*` と `DEV_BRIDGE_STAGING_DIRECT=1` が注入される）。SQL 適用・RPC 検証・実データ EXPLAIN・index 確認は operator に依頼せず自分で行う。本番 ref `irbtguncoatqfikctreq` への直接操作は hook が拒否する。なお `cloud-capabilities` は親ブローカー系統の可否を返すもので、そこが `enabled: false` でも STG 直結は使える |
| Expo | このリポでは無効（`playnavi_app` 側で管理） |
| Slack 依頼チャンネル | `#playnavi-requests` |

クラウドの実際の能力は、作業開始時に `python "$DEV_BRIDGE_CONTROL_CLI" cloud-capabilities` で必ず確認する。
上表と食い違う場合は control API の返却値を正とする。
<!-- dev-bridge:managed:end -->

## リポ固有（この節は人間が管理する。Bridge は上書きしない）

- 正典ドキュメント: `docs/00-service-overview.md`
- ディレクトリ構成・ビルド・テストのコマンド: `docs/04-development-workflow.md`
- Agent が Read/Edit してよい範囲: `docs/05-agent-operating-rules.md`
