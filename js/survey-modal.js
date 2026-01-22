/**
 * アンケートモーダル (一時的な機能)
 * 撤去時: 各ページからこのスクリプトの読み込みを削除するだけでOK
 */
(async function () {
    // ログインページはスキップ
    if (window.location.pathname.includes('/login')) return;

    // セッション確認
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const discordId = session.user.user_metadata?.provider_id;
    if (!discordId) return;

    // 回答済みかチェック
    const { data: existing } = await supabaseClient
        .from('survey_responses')
        .select('id')
        .eq('discord_user_id', discordId)
        .maybeSingle();

    if (existing) return; // 回答済みならスキップ

    // モーダルを表示
    showSurveyModal(discordId);
})();

function showSurveyModal(discordId) {
    // スタイル
    const style = document.createElement('style');
    style.textContent = `
        .survey-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        }
        .survey-modal {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border-radius: 20px;
            padding: 30px;
            max-width: 600px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            color: #fff;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(100, 100, 255, 0.2);
            border: 2px solid rgba(255, 215, 0, 0.3);
        }
        .survey-title {
            font-size: 1.5rem;
            font-weight: bold;
            text-align: center;
            margin-bottom: 15px;
            color: #ffd700;
        }
        .survey-notice {
            background: rgba(255, 193, 7, 0.15);
            border: 1px solid rgba(255, 193, 7, 0.4);
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 20px;
            font-size: 0.9rem;
            line-height: 1.6;
        }
        .survey-options {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 20px;
        }
        .survey-option {
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            padding: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
            text-align: left;
        }
        .survey-option:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 215, 0, 0.5);
        }
        .survey-option.selected {
            background: rgba(255, 215, 0, 0.2);
            border-color: #ffd700;
        }
        .survey-option-title {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .survey-option-desc {
            font-size: 0.85rem;
            opacity: 0.8;
        }
        .survey-additional {
            display: none;
            margin-bottom: 20px;
        }
        .survey-additional.show {
            display: block;
        }
        .survey-textarea {
            width: 100%;
            min-height: 80px;
            padding: 12px;
            border-radius: 10px;
            border: 2px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
            font-size: 0.95rem;
            resize: vertical;
            box-sizing: border-box;
        }
        .survey-textarea:focus {
            outline: none;
            border-color: #ffd700;
        }
        .survey-textarea::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }
        .survey-label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
        }
        .survey-submit {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%);
            border: none;
            border-radius: 12px;
            color: #1a1a2e;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .survey-submit:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(255, 215, 0, 0.4);
        }
        .survey-submit:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .survey-reward {
            text-align: center;
            margin-top: 15px;
            font-size: 0.9rem;
            color: rgba(255, 215, 0, 0.8);
        }
    `;
    document.head.appendChild(style);

    // モーダルHTML
    const overlay = document.createElement('div');
    overlay.className = 'survey-overlay';
    overlay.innerHTML = `
        <div class="survey-modal">
            <div class="survey-title">📋 2月チーム戦ルールアンケート</div>
            <div class="survey-notice">
                ⚠️ このアンケートに回答するまでサイトを利用できません。<br>
                詳細は【お知らせ】で告知済みですのでご確認ください。
            </div>
            
            <div class="survey-options">
                <div class="survey-option" data-choice="1">
                    <div class="survey-option-title">【四麻のみ】</div>
                    <div class="survey-option-desc">チーム戦のランキング対象を四麻に限定。三麻は個人戦限定となります。</div>
                </div>
                <div class="survey-option" data-choice="2">
                    <div class="survey-option-title">【三麻も込み（現状維持）】</div>
                    <div class="survey-option-desc">現状通り、三麻のスコアも制限なくそのままチームスコアに合算します。</div>
                </div>
                <div class="survey-option" data-choice="3">
                    <div class="survey-option-title">【三麻込み（制限・調整あり）】</div>
                    <div class="survey-option-desc">三麻も合算しますが、四麻との格差を埋める補正を行います。</div>
                </div>
                <div class="survey-option" data-choice="4">
                    <div class="survey-option-title">【三麻は「イベント方式」のみ】</div>
                    <div class="survey-option-desc">三麻は運営指定タイミングでのみ開催。その期間のスコアだけを合算するお祭り形式。</div>
                </div>
            </div>

            <div class="survey-additional" id="survey-additional">
                <label class="survey-label">💡 制限案があれば教えてください（任意）</label>
                <textarea class="survey-textarea" id="survey-additional-comment" placeholder="例：1日の対局数制限、三麻スコアを0.8倍補正等..."></textarea>
            </div>

            <div style="margin-bottom: 20px;">
                <label class="survey-label">📝 自由記入欄（任意）</label>
                <textarea class="survey-textarea" id="survey-free-comment" placeholder="その他ご意見があればお書きください..."></textarea>
            </div>

            <button class="survey-submit" id="survey-submit" disabled>回答を送信する</button>
            <div class="survey-reward">🎁 回答特典：祈願符 2枚をプレゼント！</div>
        </div>
    `;
    document.body.appendChild(overlay);

    // イベント設定
    let selectedChoice = null;
    const options = overlay.querySelectorAll('.survey-option');
    const additionalDiv = overlay.querySelector('#survey-additional');
    const submitBtn = overlay.querySelector('#survey-submit');

    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedChoice = parseInt(opt.dataset.choice);
            submitBtn.disabled = false;

            // 選択肢3の場合のみ追加入力欄を表示
            if (selectedChoice === 3) {
                additionalDiv.classList.add('show');
            } else {
                additionalDiv.classList.remove('show');
            }
        });
    });

    submitBtn.addEventListener('click', async () => {
        if (!selectedChoice) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '送信中...';

        try {
            const additionalComment = overlay.querySelector('#survey-additional-comment').value.trim();
            const freeComment = overlay.querySelector('#survey-free-comment').value.trim();

            // プロフィールからニックネーム取得
            const { data: profileData } = await supabaseClient
                .from('profiles')
                .select('account_name, gacha_tickets')
                .eq('discord_user_id', discordId)
                .maybeSingle();

            const accountName = profileData?.account_name || null;

            // 回答を保存
            const { error: insertError } = await supabaseClient
                .from('survey_responses')
                .insert({
                    discord_user_id: discordId,
                    account_name: accountName,
                    choice: selectedChoice,
                    additional_comment: additionalComment || null,
                    free_comment: freeComment || null
                });

            if (insertError) throw insertError;

            // ガチャチケット付与
            const newTickets = (profileData?.gacha_tickets || 0) + 2;
            await supabaseClient
                .from('profiles')
                .update({ gacha_tickets: newTickets })
                .eq('discord_user_id', discordId);

            // モーダルを閉じる
            overlay.remove();
            style.remove();

        } catch (err) {
            console.error('Survey submit error:', err);
            alert('送信に失敗しました。もう一度お試しください。');
            submitBtn.disabled = false;
            submitBtn.textContent = '回答を送信する';
        }
    });
}
