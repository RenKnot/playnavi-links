const options = (entries) => entries.map(([id, label]) => ({ id, label }));
const described = (entries) => entries.map(([id, label, description]) => ({ id, label, description }));

export const voiceV3Categories = [
  ["news_deals", "最新情報・イベント・お得情報", [
    ["game_news", "ゲームニュース", "ゲームの新情報を読む"],
    ["events", "イベント情報", "ゲーム関連イベントを探す"],
    ["subscriptions", "サブスクリプション情報", "定額サービスの追加・終了を知る"],
    ["sales", "セール情報", "ゲームの値下げを探す"],
  ]],
  ["research", "ゲーム情報を調べる", [
    ["catalog_coverage", "ゲームカタログの収録数", "調べられるゲームの範囲"],
    ["game_summary", "ゲーム説明・AI要約", "ゲームの内容を短く知る"],
    ["game_videos", "ゲーム動画", "関連する動画を見る"],
  ]],
  ["discovery", "遊びたいゲームを見つける", [
    ["for_you", "For You", "好みに合わせたおすすめ"],
    ["rankings", "ゲームランキング", "人気ゲームを順位で見る"],
    ["featured_games", "注目ゲーム一覧", "いま注目したいゲームを見る"],
    ["upcoming_games", "新作・発売予定ゲーム", "これから発売されるゲームを探す"],
  ]],
  ["library", "プレイ記録・Wishlistを管理する", [
    ["play_log", "プレイログ", "遊んだ記録を残す"],
    ["wishlist", "Wishlist", "気になるゲームを保存・管理する"],
    ["bulk_edit", "一括編集", "記録をまとめて編集する"],
    ["external_import", "外部サービスからのインポート", "外部のゲーム情報を取り込む"],
  ]],
  ["social_creation", "ユーザーとつながる・まとめを作る", [
    ["social", "ソーシャル機能", "他のユーザーをフォローして反応する"],
    ["catalog_creation", "カタログ作成", "テーマ別にゲームをまとめる"],
    ["custom_rankings", "カスタムランキング", "自分の基準で順位を作る"],
  ]],
  ["reflection_share", "自分の遊び方を振り返る・共有する", [
    ["my_best", "My Best", "自分のお気に入りをまとめる"],
    ["game_poster", "ゲームポスター", "遊んだゲームを画像で振り返る"],
    ["gamer_diagnosis", "ゲーマー診断", "ゲームの好みを診断する"],
    ["profile_stats", "プロフィール統計", "自分の記録を数字で振り返る"],
  ]],
  ["profile", "プロフィールを整える", [
    ["profile_games", "プロフィールのゲーム一覧", "遊んだゲームをプロフィールに表示する"],
    ["profile_wishlist", "プロフィールのWishlist一覧", "気になるゲームをプロフィールに表示する"],
    ["honor_titles", "称号", "獲得した称号を設定する"],
    ["avatar_cover", "アバター・カバー画像のカスタマイズ", "プロフィールの見た目を変える"],
  ]],
].map(([id, label, features]) => ({
  id,
  label,
  features: described(features),
}));

export const voiceV3FutureOptions = described([
  ["news_curation", "ゲームニュースをまとめて追う", "複数メディアの記事や動画を一覧で探し、元の発信を開く"],
  ["game_database", "ゲームDBを充実させる", "調べられるゲームやゲーム情報を増やす"],
  ["game_achievements", "ゲームのトロフィー・実績を管理する", "ゲーム内実績の取得状況をまとめる。外部との自動連携は未定"],
  ["playnavi_challenges", "PlayNavi独自のチャレンジを楽しむ", "ゲーム内実績とは別に、PlayNavi上の目標達成を記録する"],
  ["discover_user_posts", "他のユーザーのおすすめを見つける", "レビュー、カタログ、ランキングなどを探しやすくする"],
  ["promote_own_posts", "自分の投稿を見つけてもらう", "自分のレビューやまとめを、関心のある人へ届けやすくする"],
  ["creator_discovery", "クリエイターのゲーム紹介を追う", "好きな発信者や新しく知る発信者の紹介からゲームを見つける"],
  ["creator_originals", "クリエイターとの独自企画を見る", "クリエイターと制作するPlayNavi向けの企画を見る"],
  ["game_communities", "ゲームごとに感想を話し合う", "同じゲームの感想や質問を投稿して交流する"],
  ["pc_web", "PC向けWeb版を使う", "PCでログやWishlistを一覧・一括編集し、長文入力や情報比較をしやすくするなど、アプリとは異なるPC向けUIでPlayNaviを利用する"],
  ["guide_ai", "ネタバレに配慮した攻略相談をする", "知りたい範囲を伝えてAIに相談する"],
  ["library_ai", "文章・音声から記録を操作する", "AIを使い、ログやWishlistの追加・変更を行う"],
]);

const detail = (aPrompt, aEntries, bPrompt, bEntries) => ({
  a_prompt: aPrompt,
  b_prompt: bPrompt,
  a_options: options([...aEntries, ["other", "その他"], ["unknown", "判断できない"]]),
  b_options: options([...bEntries, ["other", "その他"], ["unknown", "判断できない"]]),
});

export const voiceV3FutureDetails = {
  news_curation: detail("特に期待するものはどれですか？", [
    ["aggregate", "複数メディアのニュースをまとめて追える"], ["personalize", "好きなゲームの情報を優先して見られる"],
    ["digest", "重要な話題だけを短時間で把握できる"], ["reactions", "他のユーザーのおすすめや感想を見られる"],
    ["save", "紹介されたゲームをその場でWishlistへ保存できる"],
  ], "直近30日間、ゲームニュースを最もよく見た場所はどこですか？", [
    ["media", "ゲームメディアのサイト"], ["video", "YouTube等の動画"], ["social", "X等のSNS"],
    ["news_app", "ニュースアプリ"], ["playnavi", "PlayNavi"], ["none", "最近はほとんど見ていない"],
  ]),
  game_database: detail("どの充実を最も優先してほしいですか？", [
    ["coverage", "未収録ゲームの追加"], ["aliases", "日本語名・別名から探しやすくする"],
    ["editions", "機種・移植版などを正確に区別する"], ["accuracy", "説明や発売情報を詳しく正確にする"],
    ["corrections", "不足や誤りの修正を依頼しやすくする"],
  ], "そのような不足で、直近30日間に困ったことはありますか？", [
    ["multiple", "2回以上あった"], ["once", "1回あった"], ["none", "なかった"], ["forgot", "覚えていない"],
  ]),
  game_achievements: detail("最もできるようになってほしいことはどれですか？", [
    ["earned", "取得済み実績の一覧"], ["remaining", "未取得実績の条件や進捗の確認"],
    ["platforms", "複数機種の達成状況の整理"], ["profile", "達成状況を記録やプロフィールに表示"],
  ], "手動での記録になる場合、使いたいと思いますか？", [
    ["manual_ok", "手動でも使いたい"], ["automatic_only", "自動で取り込めなければ使わないと思う"],
  ]),
  playnavi_challenges: detail("どのような達成を楽しみたいですか？", [
    ["personal", "自分で決めた目標"], ["theme", "特定テーマのゲームを遊ぶ目標"],
    ["streak", "継続的な記録"], ["limited", "期間限定の企画"],
  ], "達成をどのように楽しみたいですか？", [
    ["private", "自分だけで振り返る"], ["share", "プロフィール等で共有する"],
    ["together", "他の人と一緒に取り組む"], ["compete", "他の人と競う"],
  ]),
  discover_user_posts: detail("どのような投稿を最も見つけたいですか？", [
    ["similar", "好みの近い人のおすすめ"], ["reviews", "気になるゲームのレビュー"],
    ["catalogs", "テーマ別カタログ"], ["rankings", "ユーザーのランキング"], ["fanart", "創作やファンアート"],
  ], "直近30日間、一般ユーザーの紹介や感想を最もよく見た場所は？", [
    ["playnavi", "PlayNavi"], ["social", "SNS"], ["video", "動画"], ["blog", "ブログ・投稿サイト"],
    ["store", "ゲームストアのレビュー"], ["none", "最近は見ていない"],
  ]),
  promote_own_posts: detail("特に改善してほしいことはどれですか？", [
    ["same_game", "同じゲームに関心がある人に届く"], ["similar", "好みの近い人に届く"],
    ["collection", "投稿をまとめて見てもらえる"], ["reactions", "投稿をきっかけに反応をもらえる"],
    ["external", "外部で作った投稿も紹介できる"],
  ], "ゲームに関する投稿を、最も最近行った場所はどこですか？", [
    ["playnavi", "PlayNavi"], ["social", "SNS"], ["video", "動画・配信"], ["blog", "ブログ・投稿サイト"],
    ["never", "公開投稿をしたことはない"],
  ]),
  creator_discovery: detail("最も期待するものはどれですか？", [
    ["following", "好きなクリエイターの紹介をまとめて追う"], ["discover", "知らなかったクリエイターに出会う"],
    ["compare", "一つのゲームについて複数の紹介を比較する"], ["themes", "テーマに沿ったおすすめを読む・見る"],
  ], "直近30日間、クリエイターの紹介を最もよく見聞きした場所は？", [
    ["video", "YouTube等の動画"], ["social", "SNS"], ["article", "記事・ブログ"],
    ["audio", "音声配信"], ["playnavi", "PlayNavi"], ["none", "最近は見聞きしていない"],
  ]),
  creator_originals: detail("どのような企画を最も見たいですか？", [
    ["themes", "テーマ別のゲーム特集"], ["deep_review", "作品を掘り下げるレビュー"],
    ["interview", "開発者等との対談"], ["compare", "複数クリエイターのおすすめ比較"], ["participatory", "参加型企画"],
  ], "直近30日間、このようなゲーム企画を見たことはありますか？", [
    ["multiple", "2回以上ある"], ["once", "1回ある"], ["none", "ない"], ["forgot", "覚えていない"],
  ]),
  game_communities: detail("どのように参加したいですか？", [
    ["read", "感想を読むのが中心"], ["discuss", "自分の感想を投稿して話す"],
    ["questions", "質問や回答をする"], ["match", "一緒に遊ぶ人を探す"],
  ], "参加するうえで最も重視するものはどれですか？", [
    ["spoilers", "ネタバレを避けられる"], ["moderation", "荒らしや迷惑行為に対応できる"],
    ["mute", "見たくない相手や話題を避けられる"], ["privacy", "公開範囲を選べる"], ["none", "特にない"],
  ]),
  pc_web: detail("PC向けUIで最もしたいことはどれですか？", [
    ["bulk_edit_logs", "プレイログを一覧でまとめて追加・編集する"],
    ["bulk_edit_wishlist", "Wishlistを一覧で整理・一括編集する"],
    ["long_text", "長い記録やレビューをキーボードで入力・編集する"],
    ["compare_research", "複数のゲーム情報を並べて調べ、比較する"],
    ["profile_posts", "プロフィールや他の人の投稿を見る"],
  ], "普段、ゲームの情報収集や記録で主に使う端末はどれですか？", [
    ["smartphone", "スマートフォン"], ["pc", "PC"], ["both", "両方同じくらい"],
  ]),
  guide_ai: detail("最も相談したいことはどれですか？", [
    ["hint", "答えを明かさないヒント"], ["next", "進め方や次の目的"], ["build", "育成や編成"],
    ["completion", "収集・達成条件"],
  ], "最近、攻略で困ったときに主に使った方法はどれですか？", [
    ["site", "攻略サイト"], ["video", "動画"], ["social", "SNS・掲示板で質問"],
    ["ai", "対話型AI"], ["self", "自分で試す"], ["none", "最近は困っていない"],
  ]),
  library_ai: detail("最も手間を減らしたい作業はどれですか？", [
    ["add_log", "遊んだゲームの記録を追加"], ["summarize", "感想を記録にまとめる"],
    ["add_wishlist", "Wishlistへ追加"], ["organize", "既存の記録を変更・整理"],
  ], "入力方法はどれが使いやすそうですか？", [
    ["text", "文章を入力する"], ["voice", "声で話す"], ["both", "場面によって両方"],
  ]),
};

export const surveyV3Payload = {
  status: "ok",
  survey: {
    slug: "playnavi-voice-2026-stg-review-v1",
    schema_version: 3,
    title: "PlayNavi Voice 2026",
    description: "役立っていること、困っていること、これから期待することを教えてください。",
    questions: {
      kind: "playnavi_voice_2026_reviewed",
      usage_options: options([
        ["days_15_plus", "15日以上"], ["days_5_14", "5〜14日"], ["days_1_4", "1〜4日"],
        ["inactive_30d", "この30日間は使っていないが、以前は使った"],
        ["never_used", "一度も使ったことがない"], ["unknown", "覚えていない"],
      ]),
      overall_satisfaction_options: options([
        ["very_satisfied", "とても満足"], ["somewhat_satisfied", "やや満足"], ["neutral", "どちらともいえない"],
        ["somewhat_dissatisfied", "やや不満"], ["very_dissatisfied", "とても不満"], ["unknown", "判断できない"],
      ]),
      categories: voiceV3Categories,
      q4_exclusive_options: options([["none", "特に思い浮かばない"], ["unknown", "まだ十分に使っておらず、判断できない"]]),
      unused_reason_options: options([
        ["not_needed", "内容は知っているが、自分には必要ない"], ["alternative", "他のサービスや方法で足りている"],
        ["no_opportunity", "使う機会がまだない"], ["dont_know_how", "存在は知っていたが、使い方が分からない"],
        ["hard_to_use", "使ってみたが、使いにくかった"], ["newly_discovered", "今回、初めてこの機能を知った"],
        ["other", "その他"], ["unknown", "判断できない"],
      ]),
      problem_options: options([
        ["slow", "動作や読み込みが遅い"], ["errors", "エラーや不具合で操作できない"],
        ["navigation", "使い方や機能の場所が分かりにくい"], ["not_found", "探したゲームが見つからない"],
        ["bad_data", "ゲームの情報が足りない・正しくない"], ["library_input", "プレイ記録やWishlistの入力・整理がしにくい"],
        ["discovery", "見たいおすすめやコンテンツに出会えない"], ["social", "他のユーザーとのつながりや反応を得にくい"],
        ["overloaded", "画面に情報や機能が多すぎる"], ["other", "その他"], ["none", "特にない"], ["unknown", "判断できない"],
      ]),
      dormant_reason_options: options([
        ["less_gaming", "最近はゲームに触れる機会が少ない"], ["finished", "必要な記録や整理が済んだ"],
        ["alternative", "他のサービスや方法で足りている"], ["missing", "欲しい機能や情報が足りない"],
        ["confusing", "操作が分かりにくい"], ["quality", "動作の遅さや不具合が気になる"],
        ["forgot", "存在を忘れていた・開くきっかけがない"], ["other", "その他"],
        ["none", "特に理由はない"], ["unknown", "答えたくない・判断できない"],
      ]),
      problem_outcome_options: options([
        ["completed", "不便だったが、PlayNaviでやりたかったことを終えた"],
        ["alternative", "別のサービスや方法で済ませた"], ["abandoned", "そのときは、やろうとしていたことをやめた"],
        ["forgot", "具体的な場面までは思い出せない"],
      ]),
      future_role_options: options([
        ["news", "新しいゲーム情報やニュースをまとめて追う"], ["recommend", "自分の好みに合ったゲームのおすすめを受け取る"],
        ["research", "気になるゲームの情報を詳しく調べる"], ["record", "遊んだゲームや達成状況を記録・振り返る"],
        ["wishlist", "気になるゲームを管理し、買い時を把握する"], ["read_posts", "他の人のゲーム紹介やおすすめを読む"],
        ["publish", "自分のゲーム体験やおすすめを発信する"], ["discuss", "ゲーム好きと感想を話し合う"],
        ["other", "その他"], ["none", "特にない・現状でよい"], ["unknown", "判断できない"],
      ]),
      future_options: voiceV3FutureOptions,
      future_exclusive_options: options([["none", "この中には特にない"], ["unknown", "説明だけでは判断できない"]]),
      future_detail_options: voiceV3FutureDetails,
      unprompted_max_length: 400,
      problem_comment_max_length: 300,
      other_max_length: 400,
      valuable_feature_max: 3,
      future_candidate_max: 3,
    },
    reward: { name_ja: "PlayNavi Voice 2026" },
  },
  response: null,
};
