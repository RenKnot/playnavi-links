const categories = [
  ["news_deals", "最新情報・イベント・お得情報", [
    ["game_news", "ゲームニュース"],
    ["events", "イベント情報"],
    ["subscriptions", "サブスクリプション情報"],
    ["sales", "セール情報"],
  ]],
  ["research", "ゲーム情報を調べる", [
    ["catalog_coverage", "ゲームカタログの収録数"],
    ["game_summary", "ゲーム説明・AI要約"],
    ["game_videos", "ゲーム動画"],
  ]],
  ["discovery", "遊びたいゲームを見つける", [
    ["for_you", "For You"],
    ["rankings", "ゲームランキング"],
    ["featured_games", "注目ゲーム一覧"],
    ["upcoming_games", "新作・発売予定ゲーム"],
  ]],
  ["library", "プレイ記録・Wishlistを管理する", [
    ["play_log", "プレイログ"],
    ["wishlist", "Wishlist"],
    ["bulk_edit", "一括編集"],
    ["external_import", "外部サービスからのインポート"],
  ]],
  ["social_creation", "ユーザーとつながる・まとめを作る", [
    ["social", "ソーシャル機能"],
    ["catalog_creation", "カタログ作成"],
    ["custom_rankings", "カスタムランキング"],
  ]],
  ["reflection_share", "自分の遊び方を振り返る・共有する", [
    ["my_best", "My Best"],
    ["game_poster", "ゲームポスター"],
    ["gamer_diagnosis", "ゲーマー診断"],
    ["profile_stats", "プロフィール統計"],
  ]],
  ["profile", "プロフィールを整える", [
    ["profile_games", "プロフィールのゲーム一覧"],
    ["profile_wishlist", "プロフィールのWishlist一覧"],
    ["honor_titles", "称号"],
    ["avatar_cover", "アバター・カバー画像のカスタマイズ"],
  ]],
].map(([id, label, features]) => ({
  id,
  label,
  features: features.map(([featureId, featureLabel]) => ({
    id: featureId,
    label: featureLabel,
  })),
}));

const optionList = (entries) => entries.map(([id, label]) => ({ id, label }));

export const surveyV2Payload = {
  status: "ok",
  survey: {
    slug: "playnavi-voice-2026",
    schema_version: 2,
    title: "PlayNavi Voice 2026",
    description: "今後の改善・開発優先度を決めるためのアンケートです。",
    questions: {
      kind: "playnavi_voice_2026",
      usage_options: optionList([
        ["daily", "ほぼ毎日"],
        ["several_weekly", "週に数回"],
        ["weekly", "週1程度"],
        ["several_monthly", "月に数回"],
        ["less_monthly", "月1未満"],
        ["inactive_recently", "最近使っていない"],
      ]),
      overall_satisfaction_options: optionList([
        ["very_satisfied", "とても満足"],
        ["somewhat_satisfied", "やや満足"],
        ["neutral", "どちらともいえない"],
        ["somewhat_dissatisfied", "やや不満"],
        ["very_dissatisfied", "とても不満"],
        ["unknown", "判断できない"],
      ]),
      priority_options: optionList([
        ["critical", "最優先で改善・強化してほしい"],
        ["high", "優先的に改善・強化してほしい"],
        ["medium", "改善してほしいが、急がなくてよい"],
        ["as_is", "現状のままでよい"],
        ["unknown", "よく知らない・判断できない"],
      ]),
      importance_options: optionList([
        ["very_important", "とても重要"],
        ["somewhat_important", "やや重要"],
        ["neutral", "どちらともいえない"],
        ["not_very_important", "あまり重要でない"],
        ["not_important", "まったく重要でない"],
        ["unknown", "判断できない"],
      ]),
      detail_satisfaction_options: optionList([
        ["very_satisfied", "とても満足"],
        ["somewhat_satisfied", "やや満足"],
        ["neutral", "どちらともいえない"],
        ["somewhat_dissatisfied", "やや不満"],
        ["very_dissatisfied", "とても不満"],
        ["never_used", "使ったことがない"],
        ["unknown", "判断できない"],
      ]),
      categories,
      future_options: [
        ["achievements", "トロフィー／実績の管理", "ゲーム内実績とPlayNavi独自実績を記録"],
        ["creator_posts", "クリエイター・ファン投稿", "キュレーション、カタログ、ファンアートの投稿・紹介"],
        ["collab_content", "PlayNavi独自コラボコンテンツ", "YouTubeクリエイター等との限定企画"],
        ["pc_web", "PC向けWeb版", "PCで使いやすい画面・操作"],
        ["game_communities", "ゲームごとのコミュニティ", "掲示板やレビューへのコメント"],
        ["guide_ai", "ゲーム攻略を相談できるAI", "ネタバレ度を調整可能"],
        ["library_ai", "ログ／Wishlistを操作するAI", "チャット・音声から記録や変更を実行"],
      ].map(([id, label, description]) => ({ id, label, description })),
      comment_max_length: 200,
      second_category_optional: true,
      future_top_max: 3,
    },
    reward: { name_ja: "PlayNavi Voice 2026" },
  },
  response: null,
};
