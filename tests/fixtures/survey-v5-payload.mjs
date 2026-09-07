const options = (entries) => entries.map(([id, label]) => ({ id, label }));
const described = (entries) => entries.map(([id, label, description]) => ({ id, label, description }));
const detail = (aPrompt, aEntries, bPrompt, bEntries) => ({
  a_prompt: aPrompt,
  b_prompt: bPrompt,
  a_options: options(aEntries),
  b_options: options(bEntries),
});

export const voiceV5Categories = [
  ["news_deals", "ニュース・イベント・お得情報", [
    ["game_news", "ゲームニュース", "ゲームに関する最新情報を読む"],
    ["events", "ゲーム関連イベント", "開催中・開催予定のイベントを探す"],
    ["subscriptions", "サブスクリプション情報", "定額サービスへの追加・配信終了情報を確認する"],
    ["sales", "セール情報", "ゲームの値下げ・セール情報を確認する"],
  ]],
  ["research", "ゲームの情報を調べる", [
    ["catalog_coverage", "ゲームカタログ", "PlayNaviでゲームを検索・閲覧する"],
    ["game_summary", "ゲームの説明・AI要約", "ゲームの内容を短く確認する"],
    ["game_videos", "ゲーム動画", "ゲームに関連する動画を見る"],
  ]],
  ["discovery", "次に遊ぶゲームを見つける", [
    ["for_you", "For You", "自分の好みに合ったおすすめを見る"],
    ["rankings", "ゲームランキング", "人気のゲームをランキングで見る"],
    ["featured_games", "注目のゲーム", "いま注目したいゲームを見る"],
    ["upcoming_games", "新作・発売予定のゲーム", "これから発売されるゲームを探す"],
  ]],
  ["library", "プレイ記録・Wishlistを管理する", [
    ["play_log", "プレイログ", "遊んだゲームの記録を残す"],
    ["wishlist", "Wishlist", "気になるゲームを保存・管理する"],
    ["bulk_edit", "記録の一括編集", "複数の記録をまとめて編集する"],
    ["external_import", "外部サービスからのインポート", "外部サービスのゲーム情報を取り込む"],
  ]],
  ["social_creation", "ほかのユーザーとつながる・まとめを作る", [
    ["social", "ユーザーのフォロー・リアクション", "ほかのユーザーをフォローし、投稿に反応する"],
    ["catalog_creation", "ゲームカタログの作成", "テーマに沿ってゲームをまとめる"],
    ["custom_rankings", "カスタムランキングの作成", "自分の基準でゲームの順位を作る"],
  ]],
  ["reflection_share", "自分の遊び方を振り返る・共有する", [
    ["my_best", "My Best", "自分のお気に入りのゲームをまとめる"],
    ["game_poster", "ゲームポスター", "遊んだゲームを画像で振り返る"],
    ["gamer_diagnosis", "ゲーマー診断", "ゲームの好みを診断する"],
    ["profile_stats", "プロフィール統計", "自分のプレイ記録を数字で振り返る"],
  ]],
  ["profile", "プロフィールを整える", [
    ["profile_games", "プロフィールのゲーム一覧", "遊んだゲームをプロフィールに表示する"],
    ["profile_wishlist", "プロフィールのWishlist", "気になるゲームをプロフィールに表示する"],
    ["honor_titles", "称号", "獲得した称号をプロフィールに設定する"],
    ["avatar_cover", "アバター・カバー画像", "プロフィールの見た目を変更する"],
  ]],
].map(([id, label, features]) => ({ id, label, features: described(features) }));

export const voiceV5FutureOptions = described([
  ["news_curation", "ゲームニュースをまとめて確認する", "複数メディアの記事や動画を一覧から探し、元の記事や動画を開ける"],
  ["game_database", "ゲームデータベースを充実させる", "検索できるゲームを増やし、作品情報をより正確にする"],
  ["game_achievements", "ゲームのトロフィー・実績を管理する", "ゲーム内実績の取得状況をまとめる（外部サービスとの自動連携は未定）"],
  ["playnavi_challenges", "PlayNavi独自のチャレンジを楽しむ", "ゲーム内実績とは別に、PlayNavi上の目標達成を記録する"],
  ["discover_user_posts", "ほかのユーザーのおすすめを見つける", "レビュー・カタログ・ランキングなどを探しやすくする"],
  ["promote_own_posts", "自分の投稿を見つけてもらう", "自分のレビューやまとめを、関心のある人へ届けやすくする"],
  ["creator_discovery", "クリエイターのゲーム紹介をまとめて確認する", "好きな発信者や新しく知った発信者の紹介からゲームを見つける"],
  ["creator_originals", "クリエイターとの独自企画を見る", "クリエイターと制作するPlayNavi独自の企画を楽しむ"],
  ["game_communities", "ゲームごとに感想や質問を共有する", "同じゲームを遊ぶ人と投稿を通じて交流する"],
  ["pc_web", "PC向けWeb版を使う", "PCでログやWishlistを一覧・一括編集し、長文入力や情報比較をしやすくする"],
  ["guide_ai", "ネタバレに配慮した攻略相談をする", "知りたい範囲を指定してAIに相談する"],
  ["library_ai", "文章や音声で記録を操作する", "AIを使ってログやWishlistを追加・変更する"],
]);

export const voiceV5FutureDetails = {
  news_curation: detail("特に期待する使い方を1つ選んでください。", [
    ["aggregate", "複数メディアのニュースをまとめて確認する"], ["personalize", "好きなゲームの情報を優先して確認する"],
    ["digest", "重要な話題だけを短時間で把握する"], ["reactions", "ほかのユーザーのおすすめや感想を見る"],
    ["save", "紹介されたゲームをその場でWishlistに追加する"], ["other", "その他"], ["unknown", "判断できない"],
  ], "直近1ヶ月間、ゲームニュースを最もよく見た場所はどこですか？", [
    ["media", "ゲーム情報メディアのWebサイト"], ["video", "YouTubeなどの動画サービス"], ["social", "XなどのSNS"],
    ["news_app", "ニュースアプリ"], ["playnavi", "PlayNavi"], ["none", "直近1ヶ月間はほとんど見ていない"],
    ["other", "その他"], ["unknown", "覚えていない"],
  ]),
  game_database: detail("最も充実してほしいことを1つ選んでください。", [
    ["coverage", "未収録ゲームを追加する"], ["aliases", "日本語名や別名でも検索しやすくする"],
    ["editions", "機種別・移植版などを正確に区別する"], ["accuracy", "ゲームの説明や発売情報を詳しく・正確にする"],
    ["corrections", "情報の不足や誤りを報告しやすくする"], ["other", "その他"], ["unknown", "判断できない"],
  ], "直近1ヶ月間、そのような情報不足で困ったことはありましたか？", [
    ["multiple", "2回以上あった"], ["once", "1回あった"], ["none", "なかった"], ["forgot", "覚えていない"],
    ["other", "その他"], ["unknown", "判断できない"],
  ]),
  game_achievements: detail("最も利用したい機能を1つ選んでください。", [
    ["earned", "取得済み実績の一覧を見る"], ["remaining", "未取得実績の条件や進捗を確認する"],
    ["platforms", "複数機種の達成状況をまとめる"], ["profile", "達成状況を記録やプロフィールに表示する"],
    ["other", "その他"], ["unknown", "判断できない"],
  ], "外部サービスから自動で取り込めず、手入力が必要な場合でも使いたいですか？", [
    ["manual_ok", "手入力でも使いたい"], ["automatic_only", "自動で取り込めないなら使わない"],
    ["other", "その他"], ["unknown", "判断できない"],
  ]),
  playnavi_challenges: detail("どのようなチャレンジを楽しみたいですか？", [
    ["personal", "自分で決めた目標"], ["theme", "特定のテーマに沿ってゲームを遊ぶ目標"],
    ["streak", "継続して記録する目標"], ["limited", "期間限定の企画"], ["other", "その他"], ["unknown", "判断できない"],
  ], "達成した結果を、どのように楽しみたいですか？", [
    ["private", "自分だけで振り返る"], ["share", "プロフィールなどで共有する"],
    ["together", "ほかの人と一緒に取り組む"], ["compete", "ほかの人と競う"], ["other", "その他"], ["unknown", "判断できない"],
  ]),
  discover_user_posts: detail("どのような投稿を最も見つけたいですか？", [
    ["similar", "好みが近い人のおすすめ"], ["reviews", "気になるゲームのレビュー"], ["catalogs", "テーマ別のカタログ"],
    ["rankings", "ユーザーが作ったランキング"], ["fanart", "ゲームに関する創作やファンアート"], ["other", "その他"], ["unknown", "判断できない"],
  ], "直近1ヶ月間、一般ユーザーによるゲームの紹介や感想を最もよく見た場所はどこですか？", [
    ["playnavi", "PlayNavi"], ["social", "SNS"], ["video", "動画サービス"], ["blog", "ブログ・投稿サイト"],
    ["store", "ゲームストアのレビュー"], ["none", "直近1ヶ月間は見ていない"], ["other", "その他"], ["unknown", "覚えていない"],
  ]),
  promote_own_posts: detail("自分の投稿について、最も改善してほしいことはどれですか？", [
    ["same_game", "同じゲームに関心がある人へ届く"], ["similar", "好みが近い人へ届く"],
    ["collection", "複数の投稿をまとめて見てもらえる"], ["reactions", "投稿をきっかけに反応をもらえる"],
    ["external", "外部サービスで作った投稿も紹介できる"], ["other", "その他"], ["unknown", "判断できない"],
  ], "直近1ヶ月間、ゲームに関する投稿を最もよく行った場所はどこですか？", [
    ["playnavi", "PlayNavi"], ["social", "SNS"], ["video", "動画・配信サービス"], ["blog", "ブログ・投稿サイト"],
    ["other", "その他"], ["never", "公開投稿をしたことはない"], ["unknown", "覚えていない"],
  ]),
  creator_discovery: detail("クリエイターの紹介について、最も期待することはどれですか？", [
    ["following", "好きなクリエイターの紹介をまとめて確認する"], ["discover", "知らなかったクリエイターを見つける"],
    ["compare", "1つのゲームについて複数の紹介を比較する"], ["themes", "テーマに沿ったおすすめを見る"],
    ["other", "その他"], ["unknown", "判断できない"],
  ], "直近1ヶ月間、クリエイターによるゲーム紹介を最もよく見聞きした場所はどこですか？", [
    ["video", "YouTubeなどの動画サービス"], ["social", "SNS"], ["article", "記事・ブログ"], ["audio", "音声配信"],
    ["playnavi", "PlayNavi"], ["none", "直近1ヶ月間は見聞きしていない"], ["other", "その他"], ["unknown", "覚えていない"],
  ]),
  creator_originals: detail("最も見たい企画を1つ選んでください。", [
    ["themes", "テーマ別のゲーム特集"], ["deep_review", "作品を掘り下げるレビュー"], ["interview", "ゲーム開発者などとの対談"],
    ["compare", "複数クリエイターによるおすすめ比較"], ["participatory", "ユーザー参加型の企画"], ["other", "その他"], ["unknown", "判断できない"],
  ], "直近1ヶ月間、このようなゲーム企画を見たことはありますか？", [
    ["multiple", "2回以上見た"], ["once", "1回見た"], ["none", "見ていない"], ["forgot", "覚えていない"],
    ["other", "その他"], ["unknown", "判断できない"],
  ]),
  game_communities: detail("どのように参加したいですか？", [
    ["read", "ほかの人の感想を読む"], ["discuss", "自分の感想を投稿して話す"], ["questions", "質問したり回答したりする"],
    ["match", "一緒に遊ぶ人を探す"], ["other", "その他"], ["unknown", "判断できない"],
  ], "参加するときに最も重視することはどれですか？", [
    ["spoilers", "ネタバレを避けられる"], ["moderation", "荒らしや迷惑行為へ適切に対応してもらえる"],
    ["mute", "見たくない相手や話題を非表示にできる"], ["privacy", "公開範囲を選べる"], ["none", "特にない"],
    ["other", "その他"], ["unknown", "判断できない"],
  ]),
  pc_web: detail("PC向けWeb版で最も行いたいことはどれですか？", [
    ["bulk_edit_logs", "プレイログを一覧でまとめて追加・編集する"], ["bulk_edit_wishlist", "Wishlistを一覧で整理・一括編集する"],
    ["long_text", "長い記録やレビューをキーボードで入力・編集する"], ["compare_research", "複数のゲーム情報を並べて調べ、比較する"],
    ["profile_posts", "プロフィールやほかの人の投稿を見る"], ["other", "その他"], ["unknown", "判断できない"],
  ], "普段、ゲームの情報収集や記録に最もよく使う端末はどれですか？", [
    ["smartphone", "スマートフォン"], ["pc", "PC"], ["both", "どちらも同じくらい"], ["other", "その他"], ["unknown", "判断できない"],
  ]),
  guide_ai: detail("AIに最も相談したいことはどれですか？", [
    ["hint", "答えを明かさないヒント"], ["next", "ゲームの進め方や次の目的"], ["build", "キャラクターの育成や編成"],
    ["completion", "収集要素や達成条件"], ["other", "その他"], ["unknown", "判断できない"],
  ], "直近1ヶ月間、ゲーム攻略で困ったときに最もよく使った方法はどれですか？", [
    ["site", "攻略サイトを見る"], ["video", "動画を見る"], ["social", "SNSや掲示板で質問する"], ["ai", "対話型AIに相談する"],
    ["self", "自分で試す"], ["none", "直近1ヶ月間は攻略で困っていない"], ["other", "その他"], ["unknown", "覚えていない"],
  ]),
  library_ai: detail("最も手間を減らしたい作業はどれですか？", [
    ["add_log", "遊んだゲームの記録を追加する"], ["summarize", "感想を記録としてまとめる"],
    ["add_wishlist", "Wishlistへ追加する"], ["organize", "既存の記録を変更・整理する"], ["other", "その他"], ["unknown", "判断できない"],
  ], "どの入力方法が使いやすいと思いますか？", [
    ["text", "文章を入力する"], ["voice", "音声で入力する"], ["both", "場面に応じて両方を使う"],
    ["other", "その他"], ["unknown", "判断できない"],
  ]),
};

export const surveyV5Payload = {
  status: "ok",
  survey: {
    slug: "playnavi-voice-2026-stg-review-v3",
    schema_version: 5,
    title: "ユーザーアンケート 2026.09",
    description: "PlayNaviの改善に向けて、普段のゲームとの関わり方や、ご利用中に感じていることをお聞かせください。",
    questions: {
      kind: "playnavi_voice_2026_reviewed_monthly",
      usage_options: options([
        ["days_15_plus", "15日以上"], ["days_5_14", "5〜14日"], ["days_1_4", "1〜4日"],
        ["inactive_1m", "直近1ヶ月間は使っていないが、以前は使ったことがある"],
        ["never_used", "一度も使ったことがない"], ["unknown", "覚えていない"],
      ]),
      overall_satisfaction_options: options([
        ["very_satisfied", "とても満足"], ["somewhat_satisfied", "やや満足"], ["neutral", "どちらともいえない"],
        ["somewhat_dissatisfied", "やや不満"], ["very_dissatisfied", "とても不満"], ["unknown", "判断できない"],
      ]),
      categories: voiceV5Categories,
      q4_exclusive_options: options([
        ["none", "特に当てはまる機能はない"], ["unknown", "まだ十分に使っていないため、判断できない"],
      ]),
      unused_reason_options: options([
        ["not_needed", "自分には必要ない"], ["alternative", "ほかのサービスや方法で足りている"],
        ["no_opportunity", "使う機会がない"], ["dont_know_how", "使い方がわからない"],
        ["hard_to_use", "使いにくい"], ["newly_discovered", "このアンケートで初めて知った"],
        ["other", "その他"], ["unknown", "判断できない"],
      ]),
      problem_options: options([
        ["slow", "動作や画面の読み込みが遅い"], ["errors", "エラーや不具合で操作を続けられない"],
        ["navigation", "使い方や機能の場所がわかりにくい"], ["not_found", "探しているゲームが見つからない"],
        ["bad_data", "ゲーム情報が不足している、または正確でない"], ["library_input", "プレイ記録やWishlistを入力・整理しにくい"],
        ["discovery", "興味のあるおすすめやコンテンツを見つけにくい"], ["social", "ほかのユーザーとつながりにくい、または反応を得にくい"],
        ["overloaded", "画面に情報や機能が多く、使いにくい"], ["other", "その他"], ["none", "特にない"], ["unknown", "判断できない"],
      ]),
      dormant_reason_options: options([
        ["less_gaming", "最近はゲームで遊ぶ機会が少なかった"], ["finished", "必要な記録や整理が済んでいる"],
        ["alternative", "ほかのサービスや方法で足りている"], ["missing", "欲しい機能や情報が足りない"],
        ["confusing", "操作方法がわかりにくい"], ["quality", "動作の遅さや不具合が気になる"],
        ["forgot", "PlayNaviを開くきっかけがなかった"], ["other", "その他"], ["none", "特に理由はない"],
        ["unknown", "答えたくない・判断できない"],
      ]),
      problem_outcome_options: options([
        ["completed", "不便を感じたが、PlayNaviで目的を達成できた"], ["alternative", "ほかのサービスや方法を使った"],
        ["abandoned", "やろうとしていたことを中断した"], ["forgot", "そのときの行動を覚えていない"],
      ]),
      future_role_options: options([
        ["news", "ゲームの最新情報やニュースをまとめて確認できる"], ["recommend", "自分の好みに合うゲームを見つけられる"],
        ["research", "気になるゲームを詳しく調べられる"], ["record", "遊んだゲームや達成状況を記録・振り返れる"],
        ["wishlist", "気になるゲームを管理し、購入時期を考えられる"], ["read_posts", "ほかのユーザーのゲーム紹介やおすすめを読める"],
        ["publish", "自分のゲーム体験やおすすめを発信できる"], ["discuss", "ゲームが好きな人と感想を共有できる"],
        ["other", "その他"], ["no_expectation", "特に期待する役割はない"], ["current_is_fine", "現状のままでよい"], ["unknown", "判断できない"],
      ]),
      future_options: voiceV5FutureOptions,
      future_exclusive_options: options([
        ["none", "この中に使ってみたいものはない"], ["unknown", "説明だけでは判断できない"],
      ]),
      future_detail_options: voiceV5FutureDetails,
      unprompted_max_length: 400,
      problem_comment_max_length: 300,
      other_max_length: 400,
      future_candidate_max: 3,
      play_frequency_options: options([
        ["none", "直近1ヶ月間は遊んでいない"], ["less_than_weekly", "月に1〜3日"],
        ["days_1_2_per_week", "週1〜2日"], ["days_3_4_per_week", "週3〜4日"],
        ["days_5_6_per_week", "週5〜6日"], ["daily", "ほぼ毎日"], ["unknown", "覚えていない"], ["prefer_not", "答えたくない"],
      ]),
      primary_device_options: options([
        ["nintendo", "Nintendo Switchなどの任天堂製ゲーム機"], ["playstation", "PlayStation"], ["xbox", "Xbox"],
        ["pc", "PC"], ["mobile", "スマートフォン・タブレット"], ["other", "その他の機器"],
        ["tie", "同じくらい使った機器が複数ある"], ["unknown", "覚えていない"], ["prefer_not", "答えたくない"],
      ]),
      info_seek_options: options([
        ["days_0", "0日"], ["days_1_4", "1〜4日"], ["days_5_14", "5〜14日"], ["days_15_plus", "15日以上"],
        ["unknown", "覚えていない"], ["prefer_not", "答えたくない"],
      ]),
      recording_preference_options: options([
        ["none", "記録は残さなくてよい"], ["simple", "遊んだタイトルやプレイ状況だけを簡単に残したい"],
        ["detailed", "感想・プレイ時間・実績などを詳しく残したい"], ["depends", "ゲームによって変えたい"],
        ["unknown", "判断できない"], ["prefer_not", "答えたくない"],
      ]),
      reference_period_days: 30,
      reference_period_timezone: "Asia/Tokyo",
      reference_period_end_offset_days: 1,
      valuable_reason_max_length: 400,
      answer_note_max_length: 400,
    },
    reward: { name_ja: "アンケート協力者 2026.09" },
  },
  response: null,
};
