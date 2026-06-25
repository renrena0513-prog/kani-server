// ほりほりドリル 管理者統計

const DRILL_LABEL = {
  beginner:    '初心者ドリル',
  apprentice:  '見習いのドリル',
  stone_drill: '石ドリル',
  copper_drill:'銅ドリル',
  journeyman:  '一人前のドリル',
  iron_drill:  '鉄ドリル',
  mass_drill:  '量産型ドリル',
  veteran:     '熟練のドリル',
  silver_drill:'銀のドリル',
  allpurpose:  '万能ドリル',
};

const PERMIT_LABEL = {
  permit_100: '100m許可証',
  permit_200: '200m許可証',
};

function escDrill(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

async function fetchDrillStats() {
  const tbody = document.getElementById('drill-stats-body');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">
    <div class="spinner-border spinner-border-sm me-2" role="status"></div>読み込み中...
  </td></tr>`;

  try {
    const { data, error } = await supabaseClient.rpc('get_drill_user_stats');
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">プレイヤーデータなし</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(r => {
      const pos = r.map_date
        ? `${r.pos_x}, ${r.pos_y}m<br><small class="text-muted">${r.map_date}</small>`
        : '<span class="text-muted">—</span>';

      const drillName = DRILL_LABEL[r.equipped_drill] || (r.equipped_drill ?? '初心者ドリル');
      const dur = r.drill_durability === null ? '∞' : (r.drill_durability ?? '—');

      const permits = Array.isArray(r.permits) && r.permits.length
        ? r.permits.map(p => `<span class="badge bg-secondary me-1">${PERMIT_LABEL[p] ?? p}</span>`).join('')
        : '<span class="text-muted">—</span>';

      const goldBadge = r.drill_gold > 0
        ? `<strong class="text-warning">${r.drill_gold.toLocaleString()}G</strong>`
        : `<span class="text-muted">0G</span>`;

      const invVal = Number(r.inventory_value ?? 0);
      const invBadge = invVal > 0
        ? `<span class="text-success">${invVal.toLocaleString()}G相当</span>`
        : '<span class="text-muted">—</span>';

      return `<tr>
        <td><strong>${escDrill(r.account_name) || '<span class="text-muted">—</span>'}</strong></td>
        <td>${goldBadge}</td>
        <td class="small">${pos}</td>
        <td class="text-center">${Number(r.backpack_count ?? 0)}個</td>
        <td>${invBadge}</td>
        <td class="small">${escDrill(drillName)}<br><small class="text-muted">耐久: ${dur}</small></td>
        <td class="small">${permits}</td>
      </tr>`;
    }).join('');

  } catch (err) {
    console.error('drill stats error:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">
      エラー: ${escDrill(err.message)}<br>
      <small class="text-muted">SQL関数 get_drill_user_stats() が未実行の可能性があります</small>
    </td></tr>`;
  }
}
