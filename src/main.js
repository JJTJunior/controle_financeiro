import { INITIAL_DATA } from './data.js';
import { supabase } from './supabase.js';

// --- ESTADO GLOBAL ---
let state = {
  currentMonth: "05/2026",
  incomes: [],
  expenses: [],
  customIncomeStatuses: [],
  customExpenseStatuses: []
};

// Chave do localStorage dinâmica por usuário logado
function getStorageKey() {
  return currentUser ? `FINANCAS_PRO_DATA_${currentUser.id}` : 'FINANCAS_PRO_DATA';
}

// Variável para armazenar a sessão do usuário no Supabase
let currentUser = null;

// --- INICIALIZAÇÃO ---
async function init() {
  try {
    console.log('[Init] Iniciando app...');
    console.log('[Init] Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
    console.log('[Init] Supabase Key (primeiros 20 chars):', import.meta.env.VITE_SUPABASE_ANON_KEY?.substring(0, 20) + '...');
    
    setupEventListeners();
    setupLogin();

    // Verificar se já existe uma sessão ativa no Supabase
    const { data: { session }, error } = await supabase.auth.getSession();
    console.log('[Init] getSession resultado:', { session: !!session, error });
    
    if (error) {
      console.error('[Init] Erro ao buscar sessão:', error);
    }
    
    if (session) {
      currentUser = session.user;
      await loadUserDataFromSupabase();
      showApp();
    } else {
      showLogin();
    }

    // Listener para mudanças de autenticação
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] onAuthStateChange:', event, !!session);
      if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        await loadUserDataFromSupabase();
        showApp();
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        showLogin();
      }
    });
    
    console.log('[Init] App inicializado com sucesso.');
  } catch (err) {
    console.error('[Init] ERRO FATAL na inicialização:', err);
    alert('Erro ao inicializar o app: ' + err.message);
  }
}

function showApp() {
  const loginOverlay = document.getElementById('loginOverlay');
  const appContainer = document.getElementById('appContainer');
  
  // Exibir e-mail do usuário no Header
  const headerUserEmail = document.getElementById('headerUserEmail');
  if (headerUserEmail && currentUser) {
    headerUserEmail.textContent = currentUser.email;
  }

  loginOverlay.style.opacity = '0';
  setTimeout(() => {
    loginOverlay.style.display = 'none';
    appContainer.style.display = 'block';
    populateMonthSelector();
    render();
    renderAnalytics();
  }, 500);
}

function showLogin() {
  const loginOverlay = document.getElementById('loginOverlay');
  const appContainer = document.getElementById('appContainer');
  
  // Reseta estado da tela de login
  document.getElementById('loginTitle').textContent = "Entrar no Finanças Pro";
  document.getElementById('loginSubtitle').textContent = "Acesse sua planilha inteligente online";
  document.getElementById('loginPassword').value = '';
  
  loginOverlay.style.display = 'flex';
  loginOverlay.style.opacity = '1';
  appContainer.style.display = 'none';
}

function setupLogin() {
  const loginForm = document.getElementById('loginForm');
  const btnSignIn = document.getElementById('btnSignIn');
  const btnSignUp = document.getElementById('btnSignUp');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    btnSignIn.click();
  });

  btnSignIn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!loginEmail.value || !loginPassword.value) {
      showToast("Preencha email e senha", "error");
      return;
    }
    btnSignIn.disabled = true;
    btnSignIn.textContent = 'Entrando...';
    try {
      console.log('[Auth] Tentando login com:', loginEmail.value);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.value,
        password: loginPassword.value,
      });
      if (error) {
        console.error('[Auth] Erro no login:', error);
        showToast("Erro ao entrar: " + error.message, "error");
      } else {
        console.log('[Auth] Login OK:', data);
        showToast("Login realizado com sucesso!", "success");
      }
    } catch (err) {
      console.error('[Auth] Exceção no login:', err);
      showToast("Erro inesperado: " + err.message, "error");
    } finally {
      btnSignIn.disabled = false;
      btnSignIn.textContent = 'Entrar';
    }
  });

  btnSignUp.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!loginEmail.value || !loginPassword.value) {
      showToast("Preencha email e senha", "error");
      return;
    }
    if (loginPassword.value.length < 6) {
      showToast("A senha deve ter no mínimo 6 caracteres.", "error");
      return;
    }
    btnSignUp.disabled = true;
    btnSignUp.textContent = 'Criando...';
    try {
      console.log('[Auth] Tentando criar conta para:', loginEmail.value);
      const { data, error } = await supabase.auth.signUp({
        email: loginEmail.value,
        password: loginPassword.value,
      });
      console.log('[Auth] Resultado signUp - data:', data, 'error:', error);
      if (error) {
        console.error('[Auth] Erro ao criar conta:', error);
        showToast("Erro ao criar conta: " + error.message, "error");
      } else if (data.user && !data.session) {
        // Email confirmation está habilitado no Supabase
        showToast("Conta criada! Verifique seu e-mail para confirmar antes de entrar.", "info");
      } else if (data.session) {
        // Login automático após criação (email confirmation desabilitado)
        showToast("Conta criada com sucesso! Entrando...", "success");
      } else {
        showToast("Conta criada! Tente fazer login.", "success");
      }
    } catch (err) {
      console.error('[Auth] Exceção ao criar conta:', err);
      showToast("Erro inesperado: " + err.message, "error");
    } finally {
      btnSignUp.disabled = false;
      btnSignUp.textContent = 'Criar Conta';
    }
  });

  // Attach logout button handler globally
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      console.log('[Auth] Logout button clicked');
      try {
        // 1. Clear app data from localStorage
        const storageKey = getStorageKey();
        if (storageKey) {
          console.log('[Auth] Removing localStorage key:', storageKey);
          localStorage.removeItem(storageKey);
        }

        // 2. Clear ALL Supabase auth tokens from localStorage
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => {
          console.log('[Auth] Removing Supabase key:', key);
          localStorage.removeItem(key);
        });

        // 3. Reset app state
        state = {
          currentMonth: "05/2026",
          incomes: [],
          expenses: [],
          customIncomeStatuses: [],
          customExpenseStatuses: []
        };
        currentUser = null;

        // 4. Sign out from Supabase (with timeout fallback)
        try {
          await Promise.race([
            supabase.auth.signOut(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timeout')), 3000))
          ]);
          console.log('[Auth] Supabase signOut completed');
        } catch (signOutErr) {
          console.warn('[Auth] Supabase signOut failed or timed out:', signOutErr);
        }
      } catch (err) {
        console.error('[Auth] Error during logout:', err);
      }

      // 5. ALWAYS reload - this runs no matter what
      console.log('[Auth] Reloading page...');
      window.location.reload();
    });
  } else {
    console.warn('[Auth] btnLogout element NOT found in DOM!');
  }
}

async function loadUserDataFromSupabase() {
  if (!currentUser) {
    console.log('[Sync] Nenhum usuário logado. Retornando.');
    return;
  }

  console.log('[Sync] Carregando dados para o usuário:', currentUser.email, '(ID:', currentUser.id, ')');

  // 1. Tentar carregar os dados locais primeiro para comparação
  let localState = null;
  const storageKey = getStorageKey();
  const localDataStr = localStorage.getItem(storageKey);
  console.log('[Sync] Chave local:', storageKey, 'Existe localState:', !!localDataStr);
  if (localDataStr) {
    try {
      localState = JSON.parse(localDataStr);
    } catch (e) {
      console.error("[Sync] Erro ao ler dados locais:", e);
    }
  }

  // 2. Buscar os dados no Supabase
  console.log('[Sync] Buscando dados no Supabase...');
  const { data, error } = await supabase
    .from('user_data')
    .select('data')
    .eq('id', currentUser.id)
    .single();

  console.log('[Sync] Resposta do Supabase:', { data: !!data, error });

  if (error && error.code !== 'PGRST116') { // PGRST116 é "no rows returned"
    console.error("[Sync] Erro de RLS ou conexão ao buscar do Supabase:", error);
    showToast("Erro de conexão com o banco. Usando dados locais.", "error");
    if (localState) {
      console.log('[Sync] Fallback: Carregando localState existente.');
      state = localState;
      migrateData();
    } else {
      console.log('[Sync] Fallback: Sem localState. Carregando planilha vazia.');
      loadDefaultData(false);
    }
    return;
  }

  const remoteState = data?.data;
  console.log('[Sync] Estado remoto obtido:', !!remoteState);

  // 3. Regra de sincronização offline-first baseada em timestamps
  if (remoteState && localState) {
    const remoteTime = new Date(remoteState.lastUpdated || 0).getTime();
    const localTime = new Date(localState.lastUpdated || 0).getTime();
    console.log('[Sync] Comparando timestamps - Local:', localTime, 'Remoto:', remoteTime);

    if (localTime > remoteTime) {
      console.log('[Sync] Dados locais mais recentes. Sincronizando com a nuvem...');
      state = localState;
      migrateData();
      await saveToStorage(); // Faz upload automático dos dados locais mais novos
    } else {
      console.log('[Sync] Dados da nuvem mais recentes. Atualizando local...');
      state = remoteState;
      migrateData();
      localStorage.setItem(storageKey, JSON.stringify(state));
    }
  } else if (remoteState) {
    console.log('[Sync] Apenas dados remotos disponíveis. Baixando da nuvem...');
    state = remoteState;
    migrateData();
    localStorage.setItem(storageKey, JSON.stringify(state));
  } else if (localState) {
    console.log('[Sync] Primeiro acesso com dados locais. Enviando para a nuvem...');
    state = localState;
    migrateData();
    await saveToStorage(); // Envia os dados locais existentes para o novo usuário no Supabase
  } else {
    console.log('[Sync] Sem dados locais nem remotos. Inicializando planilha vazia...');
    loadDefaultData(false);
  }
}

function loadDefaultData(useTemplate = false) {
  if (useTemplate) {
    state = JSON.parse(JSON.stringify(INITIAL_DATA)); // deep copy
    // Injeta budgetMonth nas transações iniciais
    state.incomes.forEach(inc => inc.budgetMonth = "05/2026");
    state.expenses.forEach(exp => exp.budgetMonth = "05/2026");
  } else {
    state = {
      currentMonth: "05/2026",
      incomes: [],
      expenses: [],
      customIncomeStatuses: [],
      customExpenseStatuses: []
    };
  }
  saveToStorage();
}

function migrateData() {
  let updated = false;
  state.incomes.forEach(inc => {
    if (!inc.budgetMonth) {
      inc.budgetMonth = state.currentMonth || "05/2026";
      updated = true;
    }
  });
  state.expenses.forEach(exp => {
    if (!exp.budgetMonth) {
      exp.budgetMonth = state.currentMonth || "05/2026";
      updated = true;
    }
  });
  if (updated) saveToStorage();
}

async function saveToStorage() {
  // Atualiza o timestamp de modificação antes de salvar
  state.lastUpdated = new Date().toISOString();

  const storageKey = getStorageKey();
  console.log('[Sync] Salvando no localStorage com chave:', storageKey);
  localStorage.setItem(storageKey, JSON.stringify(state));
  
  if (currentUser) {
    console.log('[Sync] Tentando salvar no Supabase para o ID:', currentUser.id);
    const { error } = await supabase
      .from('user_data')
      .upsert({ id: currentUser.id, data: state });
      
    if (error) {
      console.error("[Sync] Erro ao salvar no Supabase:", error);
      showToast("Falha ao salvar na nuvem.", "error");
    } else {
      console.log('[Sync] Salvo no Supabase com sucesso!');
    }
  }
}

// --- SELETOR DE MESES ---
function populateMonthSelector() {
  const monthSelector = document.getElementById('monthSelector');
  
  // Coleta todos os budgetMonths existentes
  const months = new Set();
  // Mês inicial padrão
  months.add("05/2026");
  if (state.currentMonth) {
    months.add(state.currentMonth);
  }
  state.incomes.forEach(item => {
    if (item.budgetMonth) {
      months.add(item.budgetMonth);
    }
  });
  state.expenses.forEach(item => {
    if (item.budgetMonth) {
      months.add(item.budgetMonth);
    }
  });
  
  // Ordena os meses (formato MM/YYYY)
  const sortedMonths = Array.from(months).sort((a, b) => {
    const [monthA, yearA] = a.split('/').map(Number);
    const [monthB, yearB] = b.split('/').map(Number);
    if (yearA !== yearB) return yearA - yearB;
    return monthA - monthB;
  });

  monthSelector.innerHTML = '';
  sortedMonths.forEach(m => {
    const option = document.createElement('option');
    option.value = m;
    option.textContent = formatMonthName(m);
    if (m === state.currentMonth) {
      option.selected = true;
    }
    monthSelector.appendChild(option);
  });
}

function formatMonthName(monthYearStr) {
  const [month, year] = monthYearStr.split('/');
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  return `${monthNames[parseInt(month, 10) - 1]} de ${year}`;
}

// --- AUXILIARES DE FORMATAÇÃO ---
function formatCurrency(value) {
  if (value === undefined || value === null || isNaN(value)) return "R$ 0,00";
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    // Formato YYYY-MM-DD para DD.MM
    return `${parts[2]}.${parts[1]}`;
  }
  return dateStr;
}

// --- RENDERIZAÇÃO PRINCIPAL ---
function render() {
  const selectedMonth = state.currentMonth;

  // Filtrar dados pelo mês selecionado
  const filteredIncomes = state.incomes.filter(inc => inc.budgetMonth === selectedMonth);
  const filteredExpenses = state.expenses.filter(exp => exp.budgetMonth === selectedMonth);

  // 1. Atualizar contadores visuais
  document.getElementById('countIncomes').textContent = filteredIncomes.length;
  document.getElementById('countExpenses').textContent = filteredExpenses.length;

  // 2. Calcular Totais
  const totalReceived = filteredIncomes.filter(inc => inc.status === 'pago').reduce((acc, inc) => acc + inc.value, 0);
  const pendingReceive = filteredIncomes.filter(inc => inc.status !== 'pago').reduce((acc, inc) => acc + inc.value, 0);
  const totalPaidExpenses = filteredExpenses.filter(exp => exp.status === 'pago').reduce((acc, exp) => acc + exp.value, 0);
  const totalToPay = filteredExpenses.filter(exp => exp.status !== 'pago').reduce((acc, exp) => acc + exp.value, 0);

  const totalIncomesAll = totalReceived + pendingReceive;
  const totalExpensesAll = totalPaidExpenses + totalToPay;
  const remainingValue = totalIncomesAll - totalExpensesAll;

  // 3. Atualizar KPIs do Cabeçalho
  document.getElementById('valTotalReceived').textContent = formatCurrency(totalReceived);
  document.getElementById('valPendingReceive').textContent = formatCurrency(pendingReceive);
  document.getElementById('valTotalPaidExpenses').textContent = formatCurrency(totalPaidExpenses);
  document.getElementById('valTotalToPay').textContent = formatCurrency(totalToPay);
  document.getElementById('valTotalRemaining').textContent = formatCurrency(remainingValue);

  // Ajustar cor do restante da fatura (positivo/negativo)
  const remainingValEl = document.getElementById('valTotalRemaining');
  if (remainingValue < 0) {
    remainingValEl.style.color = 'var(--danger)';
  } else {
    remainingValEl.style.color = 'var(--primary)';
  }

  // 4. Barra de progresso (Proporção de comprometimento da receita)
  const progressBarFill = document.getElementById('progressBarFill');
  const percentUsed = totalIncomesAll > 0 ? (totalExpensesAll / totalIncomesAll) * 100 : 0;
  progressBarFill.style.width = `${Math.min(percentUsed, 100)}%`;
  
  if (percentUsed > 100) {
    progressBarFill.style.background = 'var(--danger)';
  } else if (percentUsed > 80) {
    progressBarFill.style.background = 'linear-gradient(90deg, var(--warning), var(--danger))';
  } else {
    progressBarFill.style.background = 'linear-gradient(90deg, var(--success), var(--primary))';
  }

  // 5. Renderizar Tabela de Receitas
  renderIncomesTable(filteredIncomes, totalReceived, pendingReceive);

  // 6. Renderizar Tabela de Despesas (Agrupadas por Categoria)
  renderExpensesTable(filteredExpenses, totalToPay, totalPaidExpenses);

  // 7. Renderizar Widgets / Gráficos de barra
  renderCategoryWidget(filteredExpenses);
  renderTypeWidget(filteredExpenses);
}

// --- TABELA DE RECEITAS ---
function renderIncomesTable(incomes, totalReceived, pendingReceive = 0) {
  const tbody = document.getElementById('tbodyIncomes');
  tbody.innerHTML = '';

  if (incomes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-muted" style="text-align: center; padding: 2rem;">
          Nenhum recebimento registrado para este mês.
        </td>
      </tr>
    `;
    return;
  }

  incomes.forEach(inc => {
    const tr = document.createElement('tr');
    tr.className = 'table-row-hover';
    
    // Status badge class
    const badgeClass = inc.status === 'pago' ? 'badge-pago' : 'badge-pendente';

    tr.innerHTML = `
      <td class="text-bold">${escapeHtml(inc.description)}</td>
      <td class="font-numeric text-bold text-success">${formatCurrency(inc.value)}</td>
      <td class="font-numeric">${formatDate(inc.date)}</td>
      <td class="col-obs">
        <span class="badge ${badgeClass}" data-id="${inc.id}" data-action="toggle-status">
          ${inc.status}
        </span>
        ${inc.obs ? `<span class="obs-note" title="${escapeHtml(inc.obs)}">${escapeHtml(inc.obs)}</span>` : ''}
      </td>
      <td class="text-right">
        <div class="actions-cell">
          <button class="btn-icon edit" data-id="${inc.id}" data-type="income" title="Editar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon delete" data-id="${inc.id}" data-type="income" title="Excluir">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Linha de Resumo do Recebido
  const summaryTr = document.createElement('tr');
  summaryTr.className = 'summary-row';
  summaryTr.style.background = 'rgba(16, 185, 129, 0.05)';
  summaryTr.innerHTML = `
    <td class="text-success text-bold">TOTAL RECEBIDO (PAGO)</td>
    <td class="font-numeric text-bold text-success" colspan="3">${formatCurrency(totalReceived)}</td>
    <td></td>
  `;
  tbody.appendChild(summaryTr);

  // Linha de Resumo do Pendente
  if (pendingReceive > 0) {
    const pendingTr = document.createElement('tr');
    pendingTr.className = 'summary-row';
    pendingTr.style.background = 'rgba(245, 158, 11, 0.05)';
    pendingTr.innerHTML = `
      <td class="text-warning text-bold">TOTAL A RECEBER (PENDENTE)</td>
      <td class="font-numeric text-bold text-warning" colspan="3">${formatCurrency(pendingReceive)}</td>
      <td></td>
    `;
    tbody.appendChild(pendingTr);
  }
}

// --- TABELA DE DESPESAS ---
function renderExpensesTable(expenses, totalToPay, totalPaidExpenses = 0) {
  const tbody = document.getElementById('tbodyExpenses');
  tbody.innerHTML = '';

  if (expenses.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-muted" style="text-align: center; padding: 2rem;">
          Nenhuma despesa registrada para este mês.
        </td>
      </tr>
    `;
    return;
  }

  // Agrupar despesas por categoria
  const grouped = {};
  expenses.forEach(exp => {
    const cat = exp.category || 'Outros';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(exp);
  });

  // Ordenar categorias alfabeticamente
  const sortedCategories = Object.keys(grouped).sort();

  sortedCategories.forEach(category => {
    // Linha de cabeçalho da categoria
    const headerTr = document.createElement('tr');
    headerTr.className = 'category-group-row';
    headerTr.innerHTML = `
      <td colspan="7"><span style="text-transform: uppercase;">📁 ${escapeHtml(category)}</span></td>
    `;
    tbody.appendChild(headerTr);

    const items = grouped[category];
    // Ordenar itens da categoria pelo vencimento/data
    items.sort((a, b) => new Date(a.date) - new Date(b.date));

    items.forEach(exp => {
      const tr = document.createElement('tr');
      tr.className = 'table-row-hover';

      // Identificar classe do status badge
      let badgeClass = 'badge-pendente';
      const statusLower = exp.status.toLowerCase();
      if (statusLower === 'pago') {
        badgeClass = 'badge-pago';
      } else if (statusLower === 'agendado') {
        badgeClass = 'badge-agendado';
      } else if (statusLower.includes('sem recurso') || statusLower.includes('sem internet')) {
        badgeClass = 'badge-sem-recurso';
      }

      // Tipo de custo badge (fixo ou variante)
      const costTypeBadge = exp.costType === 'fixo' 
        ? `<span class="badge-fixo">Fixo</span>` 
        : `<span class="badge-variante">Variante</span>`;

      tr.innerHTML = `
        <td>${costTypeBadge}</td>
        <td class="text-bold">${escapeHtml(exp.description)}</td>
        <td class="font-numeric text-bold" style="color: var(--text-main);">${formatCurrency(exp.value)}</td>
        <td class="font-numeric">${formatDate(exp.date)}</td>
        <td>
          <span class="badge ${badgeClass}" data-id="${exp.id}" data-action="toggle-status" title="Clique para alternar o status">
            ${escapeHtml(exp.status)}
          </span>
        </td>
        <td class="col-obs">
          ${exp.obs ? `<span class="obs-note" title="${escapeHtml(exp.obs)}">${escapeHtml(exp.obs)}</span>` : '-'}
        </td>
        <td class="text-right">
          <div class="actions-cell">
            <button class="btn-icon edit" data-id="${exp.id}" data-type="expense" title="Editar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-icon delete" data-id="${exp.id}" data-type="expense" title="Excluir">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  });

  // Linha de Resumo Geral Pago
  if (totalPaidExpenses > 0) {
    const paidTr = document.createElement('tr');
    paidTr.className = 'summary-row';
    paidTr.style.background = 'rgba(14, 165, 233, 0.05)';
    paidTr.innerHTML = `
      <td colspan="2" class="text-info text-bold" style="letter-spacing: 0.05em;">TOTAL PAGO</td>
      <td class="font-numeric text-bold text-info" colspan="4">${formatCurrency(totalPaidExpenses)}</td>
      <td></td>
    `;
    tbody.appendChild(paidTr);
  }

  // Linha de Resumo Geral a Pagar
  const summaryTr = document.createElement('tr');
  summaryTr.className = 'summary-row';
  summaryTr.style.background = 'rgba(244, 63, 94, 0.05)';
  summaryTr.innerHTML = `
    <td colspan="2" class="text-danger text-bold" style="letter-spacing: 0.05em;">TOTAL A PAGAR (PENDENTE)</td>
    <td class="font-numeric text-bold text-danger" colspan="4">${formatCurrency(totalToPay)}</td>
    <td></td>
  `;
  tbody.appendChild(summaryTr);
}

// --- WIDGET GRÁFICO CATEGORIA ---
function renderCategoryWidget(expenses) {
  const chartContainer = document.getElementById('categoryChart');
  chartContainer.innerHTML = '';

  if (expenses.length === 0) {
    chartContainer.innerHTML = `<div class="text-muted" style="text-align: center; font-size: 0.85rem; padding: 1rem 0;">Sem despesas para analisar.</div>`;
    return;
  }

  // Agrupa valores por categoria
  const catSums = {};
  expenses.forEach(exp => {
    const cat = exp.category || 'Outros';
    catSums[cat] = (catSums[cat] || 0) + exp.value;
  });

  // Ordena por maior valor
  const sorted = Object.entries(catSums).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(...Object.values(catSums));

  sorted.forEach(([cat, val]) => {
    const percentOfMax = maxVal > 0 ? (val / maxVal) * 100 : 0;
    
    const item = document.createElement('div');
    item.className = 'category-bar-item';
    item.innerHTML = `
      <div class="category-bar-info">
        <span class="category-name">${escapeHtml(cat)}</span>
        <span class="category-value">${formatCurrency(val)}</span>
      </div>
      <div class="category-bar-bg">
        <div class="category-bar-fill" style="width: 0%; background: var(--primary);"></div>
      </div>
    `;
    chartContainer.appendChild(item);
    
    // Trigger slide-in animation
    setTimeout(() => {
      const fill = item.querySelector('.category-bar-fill');
      if (fill) fill.style.width = `${percentOfMax}%`;
    }, 50);
  });
}

// --- WIDGET GRÁFICO TIPO DE CUSTO ---
function renderTypeWidget(expenses) {
  const fixoVal = expenses.filter(exp => exp.costType === 'fixo').reduce((acc, exp) => acc + exp.value, 0);
  const varVal = expenses.filter(exp => exp.costType === 'variante').reduce((acc, exp) => acc + exp.value, 0);
  const total = fixoVal + varVal;

  document.getElementById('valFixoSummary').textContent = formatCurrency(fixoVal);
  document.getElementById('valVarianteSummary').textContent = formatCurrency(varVal);

  const fillFixo = document.getElementById('fillFixoSummary');
  const fillVariante = document.getElementById('fillVarianteSummary');

  if (total > 0) {
    const pctFixo = (fixoVal / total) * 100;
    const pctVar = (varVal / total) * 100;
    
    setTimeout(() => {
      fillFixo.style.width = `${pctFixo}%`;
      fillVariante.style.width = `${pctVar}%`;
    }, 50);
  } else {
    fillFixo.style.width = '0%';
    fillVariante.style.width = '0%';
  }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toastMessage');
  const iconEl = document.getElementById('toastIcon');

  toast.className = `toast toast-${type} show`;
  msgEl.textContent = message;
  
  if (type === 'success') {
    iconEl.innerHTML = '✓';
  } else if (type === 'error') {
    iconEl.innerHTML = '✗';
  } else {
    iconEl.innerHTML = 'ℹ';
  }

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// --- EVENT LISTENERS E CONTROLE ---
function setupEventListeners() {
  // Seletor de mês
  document.getElementById('monthSelector').addEventListener('change', (e) => {
    state.currentMonth = e.target.value;
    saveToStorage();
    render();
  });

  // Novo Mês Modal
  document.getElementById('btnNewMonth').addEventListener('click', () => {
    document.getElementById('newMonthInput').value = '';
    document.getElementById('monthModal').classList.add('active');
  });
  document.getElementById('btnDuplicateMonth').addEventListener('click', () => {
    duplicateCurrentMonth();
});
document.getElementById('btnMonthModalClose').addEventListener('click', () => {
    document.getElementById('monthModal').classList.remove('active');
});
  document.getElementById('btnMonthModalCancel').addEventListener('click', () => {
    document.getElementById('monthModal').classList.remove('active');
  });
  document.getElementById('monthForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const newVal = document.getElementById('newMonthInput').value.trim();
    if (/^(0[1-9]|1[0-2])\/\d{4}$/.test(newVal)) {
      state.currentMonth = newVal;
      saveToStorage();
      populateMonthSelector();
      render();
      document.getElementById('monthModal').classList.remove('active');
      showToast("Novo mês adicionado!", "success");
    } else {
      showToast("Formato inválido. Use MM/AAAA.", "error");
    }
  });

  // Novo Status Select
  document.getElementById('formStatus').addEventListener('change', (e) => {
    if (e.target.value === 'add_new_status') {
      const type = document.getElementById('formType').value;
      const newStatus = prompt("Digite o nome do novo status:");
      if (newStatus && newStatus.trim()) {
        const cleanStatus = newStatus.trim().toLowerCase();
        if (type === 'income') {
          if (!state.customIncomeStatuses) state.customIncomeStatuses = [];
          if (!state.customIncomeStatuses.includes(cleanStatus)) {
            state.customIncomeStatuses.push(cleanStatus);
            saveToStorage();
          }
        } else {
          if (!state.customExpenseStatuses) state.customExpenseStatuses = [];
          if (!state.customExpenseStatuses.includes(cleanStatus)) {
            state.customExpenseStatuses.push(cleanStatus);
            saveToStorage();
          }
        }
        
        // Re-render select options and select the new one
        const option = document.createElement('option');
        option.value = cleanStatus;
        option.textContent = cleanStatus;
        e.target.insertBefore(option, e.target.lastElementChild);
        e.target.value = cleanStatus;
      } else {
        e.target.selectedIndex = 0;
      }
    }
  });

  // Botões de Adicionar
  document.getElementById('btnNewIncome').addEventListener('click', () => openModal('income'));
  document.getElementById('btnNewExpense').addEventListener('click', () => openModal('expense'));

  // Cancelar Modal
  document.getElementById('btnModalCancel').addEventListener('click', closeModal);
  document.getElementById('btnModalClose').addEventListener('click', closeModal);
  document.getElementById('transactionModal').addEventListener('click', (e) => {
    if (e.target.id === 'transactionModal') closeModal();
  });

  // Envio do formulário
  document.getElementById('transactionForm').addEventListener('submit', handleFormSubmit);

  // Ações nas Tabelas (Editar, Deletar, Toggle Status)
  document.getElementById('tbodyIncomes').addEventListener('click', handleTableAction);
  document.getElementById('tbodyExpenses').addEventListener('click', handleTableAction);

  // Backup e Redefinição
  document.getElementById('btnExportJSON').addEventListener('click', exportData);
  document.getElementById('btnImportJSON').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', importData);

  // Importação de Planilha Excel/CSV
  document.getElementById('btnImportSpreadsheet').addEventListener('click', () => {
    document.getElementById('spreadsheetInput').click();
  });
  document.getElementById('spreadsheetInput').addEventListener('change', importSpreadsheetData);
  
  document.getElementById('btnDeleteYear').addEventListener('click', () => {
    const yearToDelete = prompt("Digite o ano que deseja excluir (ex: 2025):");
    if (yearToDelete && /^\d{4}$/.test(yearToDelete)) {
      if (confirm(`Tem certeza que deseja apagar permanentemente todos os dados do ano ${yearToDelete}? Essa ação não pode ser desfeita.`)) {
        state.incomes = state.incomes.filter(inc => !(inc.budgetMonth && inc.budgetMonth.endsWith('/' + yearToDelete)));
        state.expenses = state.expenses.filter(exp => !(exp.budgetMonth && exp.budgetMonth.endsWith('/' + yearToDelete)));
        
        if (state.currentMonth && state.currentMonth.endsWith('/' + yearToDelete)) {
          state.currentMonth = '';
        }
        
        saveToStorage();
        populateMonthSelector();
        
        if (!state.currentMonth) {
          const monthSelector = document.getElementById('monthSelector');
          if (monthSelector.options.length > 0) {
            state.currentMonth = monthSelector.options[0].value;
          } else {
            state.currentMonth = "05/2026";
            populateMonthSelector();
          }
        }
        
        render();
        showToast(`Dados do ano ${yearToDelete} excluídos com sucesso!`, "success");
      }
    } else if (yearToDelete) {
      showToast("Ano inválido. Digite um ano com 4 dígitos.", "error");
    }
  });

  document.getElementById('btnResetData').addEventListener('click', () => {
    if (confirm("Tem certeza que deseja redefinir os dados para os originais da planilha? Todas as alterações manuais serão perdidas.")) {
      loadDefaultData(true);
      populateMonthSelector();
      render();
      showToast("Dados redefinidos para o padrão com sucesso!", "info");
    }
  });

  document.getElementById('btnClearData').addEventListener('click', () => {
    if (confirm("Tem certeza que deseja apagar permanentemente todas as suas receitas e despesas? Essa ação não pode ser desfeita.")) {
      loadDefaultData(false);
      populateMonthSelector();
      render();
      showToast("Todos os dados foram excluídos com sucesso!", "info");
    }
  });

  // --- NAVEGAÇÃO ENTRE VIEWS ---
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const targetView = tab.getAttribute('data-view');
      document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active-view'));
      document.getElementById(targetView).classList.add('active-view');
      if (targetView === 'dashboardView') {
        populateAnalyticsSelectors();
        renderAnalytics();
      }
    });
  });

  // --- ANALYTICS ---
  document.getElementById('btnApplyAnalytics').addEventListener('click', () => renderAnalytics());
}

// --- CONTROLE DA MODAL ---
function openModal(type, editId = null) {
  const modal = document.getElementById('transactionModal');
  const title = document.getElementById('modalTitle');
  const form = document.getElementById('transactionForm');
  const expenseFields = document.getElementById('expenseFieldsOnly');
  const statusSelect = document.getElementById('formStatus');
  
  form.reset();
  document.getElementById('formId').value = editId || '';
  document.getElementById('formType').value = type;

  // Configurar campos conforme tipo
  if (type === 'income') {
    title.textContent = editId ? "Editar Recebimento" : "Novo Recebimento";
    document.getElementById('lblDescricao').textContent = "Descrição do Recebimento";
    expenseFields.style.display = 'none';
    
    // Status de receita
    const defaultIncomeStatuses = ['pago', 'pendente'];
    const allIncomeStatuses = [...defaultIncomeStatuses, ...(state.customIncomeStatuses || [])];
    statusSelect.innerHTML = allIncomeStatuses.map(s => `<option value="${s}">${s}</option>`).join('') + `<option value="add_new_status" style="font-weight: bold; color: var(--primary);">+ Criar Novo Status...</option>`;
    
    // Data default
    document.getElementById('formDate').value = new Date().toISOString().substring(0, 10);
  } else {
    title.textContent = editId ? "Editar Despesa" : "Nova Despesa";
    document.getElementById('lblDescricao').textContent = "Fatura / Boleto";
    expenseFields.style.display = 'block';
    
    // Status de despesa
    const defaultExpenseStatuses = ['pago', 'agendado', 'sem recurso no mês', 'sem internet no momento', 'pendente'];
    const allExpenseStatuses = [...defaultExpenseStatuses, ...(state.customExpenseStatuses || [])];
    statusSelect.innerHTML = allExpenseStatuses.map(s => `<option value="${s}">${s}</option>`).join('') + `<option value="add_new_status" style="font-weight: bold; color: var(--primary);">+ Criar Novo Status...</option>`;
    
    // Data default
    document.getElementById('formDate').value = new Date().toISOString().substring(0, 10);
  }

  // Se for edição, carregar dados existentes
  if (editId) {
    const list = type === 'income' ? state.incomes : state.expenses;
    const item = list.find(x => x.id === editId);
    if (item) {
      document.getElementById('formDescription').value = item.description;
      document.getElementById('formValue').value = item.value;
      document.getElementById('formDate').value = item.date;
      statusSelect.value = item.status;
      document.getElementById('formObs').value = item.obs || '';
      
      if (type === 'expense') {
        document.getElementById('formCostType').value = item.costType || 'variante';
        document.getElementById('formCategory').value = item.category || '';
      }
    }
  }

  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('transactionModal').classList.remove('active');
}

// --- SUBMISSÃO FORMULÁRIO ---
function handleFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('formId').value;
  const type = document.getElementById('formType').value;

  const desc = document.getElementById('formDescription').value.trim();
  const value = parseFloat(document.getElementById('formValue').value);
  const date = document.getElementById('formDate').value;
  const status = document.getElementById('formStatus').value;
  const obs = document.getElementById('formObs').value.trim();

  // Calcular budgetMonth correspondente
  // Ex: "2026-05-11" -> "05/2026"
  const dateObj = new Date(date + 'T00:00:00');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  const computedBudgetMonth = `${mm}/${yyyy}`;

  if (!desc || isNaN(value)) {
    showToast("Por favor, preencha todos os campos corretamente.", "error");
    return;
  }

  if (type === 'income') {
    const incomeData = {
      id: id || `inc-${Date.now()}`,
      description: desc,
      value: value,
      date: date,
      status: status,
      obs: obs,
      budgetMonth: id ? state.incomes.find(x => x.id === id).budgetMonth : state.currentMonth // Mantém o mês do dashboard atual se for novo, ou preserva o do edit
    };

    if (id) {
      const idx = state.incomes.findIndex(x => x.id === id);
      if (idx !== -1) state.incomes[idx] = incomeData;
    } else {
      state.incomes.push(incomeData);
    }
  } else {
    const costType = document.getElementById('formCostType').value;
    const category = document.getElementById('formCategory').value.trim().toLowerCase() || 'outros';

    const expenseData = {
      id: id || `exp-${Date.now()}`,
      costType: costType,
      category: category,
      description: desc,
      value: value,
      date: date,
      status: status,
      obs: obs,
      budgetMonth: id ? state.expenses.find(x => x.id === id).budgetMonth : state.currentMonth
    };

    if (id) {
      const idx = state.expenses.findIndex(x => x.id === id);
      if (idx !== -1) state.expenses[idx] = expenseData;
    } else {
      state.expenses.push(expenseData);
    }
  }

  saveToStorage();
  closeModal();
  populateMonthSelector(); // Pode ser que o mês do item altere a lista
  render();
  showToast(id ? "Lançamento editado com sucesso!" : "Lançamento adicionado com sucesso!", "success");
}

// --- INTERAÇÕES DA TABELA (EDITAR, EXCLUIR, TOGGLE STATUS) ---
function handleTableAction(e) {
  const target = e.target;
  const action = target.getAttribute('data-action') || target.closest('button')?.getAttribute('data-type') && 'btn-click';
  const id = target.getAttribute('data-id') || target.closest('button')?.getAttribute('data-id');
  const type = target.getAttribute('data-type') || target.closest('button')?.getAttribute('data-type');

  if (!id) return;

  // Ação 1: Trocar Status com um clique rápido (Toggle)
  if (action === 'toggle-status') {
    const isIncome = id.startsWith('inc');
    if (isIncome) {
      const inc = state.incomes.find(x => x.id === id);
      if (inc) {
        const cycles = ['pago', 'pendente', ...(state.customIncomeStatuses || [])];
        let nextIdx = (cycles.indexOf(inc.status.toLowerCase()) + 1) % cycles.length;
        if (nextIdx === -1 || isNaN(nextIdx)) nextIdx = 0;
        inc.status = cycles[nextIdx];
        saveToStorage();
        render();
        showToast(`Status de "${inc.description}" alterado para ${inc.status}!`, "success");
      }
    } else {
      const exp = state.expenses.find(x => x.id === id);
      if (exp) {
        const cycles = ['pago', 'agendado', 'sem recurso no mês', 'sem internet no momento', 'pendente', ...(state.customExpenseStatuses || [])];
        let nextIdx = (cycles.indexOf(exp.status.toLowerCase()) + 1) % cycles.length;
        if (nextIdx === -1 || isNaN(nextIdx)) nextIdx = 0;
        exp.status = cycles[nextIdx];
        saveToStorage();
        render();
        showToast(`Status de "${exp.description}" alterado para ${exp.status}!`, "success");
      }
    }
    return;
  }

  // Ação 2: Editar Lançamento
  const button = target.closest('button');
  if (button && button.classList.contains('edit')) {
    openModal(type, id);
    return;
  }

  // Ação 3: Deletar Lançamento
  if (button && button.classList.contains('delete')) {
    const list = type === 'income' ? state.incomes : state.expenses;
    const item = list.find(x => x.id === id);
    if (item && confirm(`Tem certeza que deseja excluir "${item.description}"?`)) {
      if (type === 'income') {
        state.incomes = state.incomes.filter(x => x.id !== id);
      } else {
        state.expenses = state.expenses.filter(x => x.id !== id);
      }
      saveToStorage();
      populateMonthSelector();
      render();
      showToast("Lançamento removido com sucesso!", "info");
    }
  }
}

// --- EXPORTAR BACKUP ---
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `financas_pro_backup_${state.currentMonth.replace('/', '_')}.json`);
  dlAnchorElem.click();
  showToast("Backup exportado com sucesso!", "success");
}

// --- IMPORTAR BACKUP ---
function importData(e) {
  const fileReader = new FileReader();
  const file = e.target.files[0];
  if (!file) return;

  fileReader.onload = function(event) {
    try {
      const parsed = JSON.parse(event.target.result);
      if (parsed && Array.isArray(parsed.incomes) && Array.isArray(parsed.expenses)) {
        state = parsed;
        saveToStorage();
        populateMonthSelector();
        render();
        showToast("Backup importado com sucesso!", "success");
      } else {
        showToast("Arquivo de backup inválido.", "error");
      }
    } catch (err) {
      showToast("Erro ao ler o arquivo de backup.", "error");
      console.error(err);
    }
  };
  fileReader.readAsText(file);
}

// --- SEGURANÇA HTML ---
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- IMPORTAÇÃO DE PLANILHA EXCEL/CSV ---
function parseSheetNameToBudgetMonth(sheetName) {
  const name = String(sheetName).trim().toLowerCase();
  
  // Lista de correspondência de meses em português
  const monthsMap = {
    'jan': '01', 'janeiro': '01',
    'fev': '02', 'fevereiro': '02',
    'mar': '03', 'marco': '03', 'março': '03',
    'abr': '04', 'abril': '04',
    'mai': '05', 'maio': '05',
    'jun': '06', 'junho': '06',
    'jul': '07', 'julho': '07',
    'ago': '08', 'agosto': '08',
    'set': '09', 'setembro': '09',
    'out': '10', 'outubro': '10',
    'nov': '11', 'novembro': '11',
    'dez': '12', 'dezembro': '12'
  };

  let month = '';
  let year = '';

  // 1. Tentar encontrar nome do mês
  for (const [key, val] of Object.entries(monthsMap)) {
    if (name.includes(key)) {
      month = val;
      break;
    }
  }

  // 2. Se não achou nome por extenso, procurar por número (ex: "05", "12")
  if (!month) {
    const matchMonth = name.match(/\b(0[1-9]|1[0-2])\b/);
    if (matchMonth) {
      month = matchMonth[1];
    }
  }

  // Fallback se não encontrar mês
  if (!month) {
    month = String(new Date().getMonth() + 1).padStart(2, '0');
  }

  // 3. Procurar ano (4 dígitos como 2026 ou 2 dígitos como 26)
  const match4 = name.match(/(20\d{2})/);
  if (match4) {
    year = match4[1];
  } else {
    // Procura por 2 dígitos precedidos por separador (/, -, _, ., espaço) ou no fim do texto
    const match2 = name.match(/[\/\s_.-](\d{2})\b/) || name.match(/(\d{2})$/);
    if (match2 && match2[1] !== month) {
      year = '20' + match2[1];
    } else {
      year = String(new Date().getFullYear());
    }
  }

  return `${month}/${year}`;

// --- DUPLICAR MÊS FUNÇÃO ---
function duplicateMonthData(sourceMonth, targetMonth) {
  if (!sourceMonth || !targetMonth) {
    showToast('Meses inválidos para duplicação.', 'error');
    return;
  }
  // Duplicar receitas
  const sourceIncomes = state.incomes.filter(i => i.budgetMonth === sourceMonth);
  const duplicatedIncomes = sourceIncomes.map(i => ({
    ...i,
    id: `inc-dup-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
    budgetMonth: targetMonth
  }));
  // Duplicar despesas
  const sourceExpenses = state.expenses.filter(e => e.budgetMonth === sourceMonth);
  const duplicatedExpenses = sourceExpenses.map(e => ({
    ...e,
    id: `exp-dup-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
    budgetMonth: targetMonth
  }));
  // Inserir nos arrays de estado
  state.incomes.push(...duplicatedIncomes);
  state.expenses.push(...duplicatedExpenses);
  // Atualizar UI e persistência
  saveToStorage();
  populateMonthSelector();
  render();
  showToast(`Dados de ${sourceMonth} duplicados para ${targetMonth}.`, 'success');
}

function getNextMonth(monthYear) {
  const [mm, yy] = monthYear.split('/').map(Number);
  let nextMonth = mm + 1;
  let nextYear = yy;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  return `${String(nextMonth).padStart(2, '0')}/${nextYear}`;
}

function duplicateCurrentMonth() {
  console.log('Duplicate button clicked', state.currentMonth);
  if (!state.currentMonth) {
    showToast('Selecione um mês antes de duplicar.', 'error');
    return;
  }
  const sourceMonth = state.currentMonth;
  const targetMonth = getNextMonth(sourceMonth);
  // Duplicar os dados
  duplicateMonthData(sourceMonth, targetMonth);
  // Mudar para o novo mês
  state.currentMonth = targetMonth;
  saveToStorage();
  populateMonthSelector();
  // Ensure selector reflects new month
  const monthSel = document.getElementById('monthSelector');
  if (monthSel) monthSel.value = targetMonth;
  render();
}
}

function importSpreadsheetData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      const allIncomes = [];
      const allExpenses = [];
      const importedMonths = new Set();

      // Percorrer todas as abas presentes na planilha
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        // Converter a aba para matriz 2D (array de arrays)
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const budgetMonth = parseSheetNameToBudgetMonth(sheetName);
        const result = parseSpreadsheet2DArray(rows, budgetMonth);
        
        // Ignora abas que não contêm transações válidas (como dashboards ou abas vazias)
        if (result.incomes.length > 0 || result.expenses.length > 0) {
          allIncomes.push(...result.incomes);
          allExpenses.push(...result.expenses);
          importedMonths.add(budgetMonth);
        }
      });

      if (importedMonths.size === 0) {
        showToast("Nenhum dado financeiro reconhecido nas abas da planilha.", "error");
        return;
      }

      // Limpar os registros antigos do banco local apenas para os meses importados
      state.incomes = state.incomes.filter(inc => !importedMonths.has(inc.budgetMonth)).concat(allIncomes);
      state.expenses = state.expenses.filter(exp => !importedMonths.has(exp.budgetMonth)).concat(allExpenses);

      // Define como mês selecionado atual o mês importado cronologicamente mais recente
      const sortedImportedMonths = Array.from(importedMonths).sort((a, b) => {
        const [mA, yA] = a.split('/').map(Number);
        const [mB, yB] = b.split('/').map(Number);
        if (yA !== yB) return yA - yB;
        return mA - mB;
      });
      
      if (sortedImportedMonths.length > 0) {
        state.currentMonth = sortedImportedMonths[sortedImportedMonths.length - 1];
      }

      saveToStorage();
      populateMonthSelector();
      render();
      
      showToast(`Planilha importada! Carregados ${importedMonths.size} mês(es): ${Array.from(importedMonths).join(', ')}.`, "success");
    } catch (err) {
      console.error("Erro no processamento da planilha:", err);
      showToast("Erro ao processar a planilha. Verifique se o formato é válido.", "error");
    }
  };
  reader.readAsArrayBuffer(file);
  
  // Limpa o valor do input para permitir re-upload do mesmo arquivo
  e.target.value = '';
}

function parseSpreadsheet2DArray(rows, budgetMonth) {
  let expColStart = 0;
  let incColStart = -1;
  
  // 1. Identificar dinamicamente as colunas de início das tabelas nesta aba
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim().toLowerCase();
      if (val.includes('tipo de custo')) {
        expColStart = c;
      }
      if (val.includes('recebimento do mês') || val.includes('recebimento do mes')) {
        incColStart = c;
      }
    }
  }

  // Fallback caso não ache a coluna de recebimentos
  if (incColStart === -1) {
    incColStart = 8;
  }

  const parsedIncomes = [];
  const parsedExpenses = [];
  let lastCategory = 'outros';

  // 2. Varrer todas as linhas da aba
  rows.forEach((row, rowIndex) => {
    if (!row || row.length === 0) return;

    // --- LEITURA DE DESPESAS (Lado Esquerdo) ---
    if (row.length > expColStart) {
      const costTypeRaw = row[expColStart];
      const categoryRaw = row[expColStart + 1];
      const descRaw = row[expColStart + 2];
      const valRaw = row[expColStart + 3];
      const dateRaw = row[expColStart + 4];
      const obsRaw = row[expColStart + 5];

      const descStr = String(descRaw || '').trim();
      const costTypeStr = String(costTypeRaw || '').trim().toLowerCase();

      // Valida se é uma linha de dados de despesa legítima
      const isHeader = costTypeStr.includes('tipo') || descStr.toLowerCase().includes('fatura') || descStr.toLowerCase().includes('boleto');
      const isTotal = descStr.toLowerCase().includes('total');
      const hasData = descStr !== '' && !isHeader && !isTotal;

      if (hasData) {
        // Células de categoria mescladas (propaga o último valor válido da aba)
        if (categoryRaw !== undefined && categoryRaw !== null && String(categoryRaw).trim() !== '') {
          lastCategory = String(categoryRaw).trim().toLowerCase();
        }

        const costType = (costTypeStr === 'fixo' || costTypeStr === 'variante') ? costTypeStr : 'variante';
        const value = parseNumericValue(valRaw);
        const date = parseExcelDate(dateRaw, budgetMonth);
        const obs = obsRaw ? String(obsRaw).trim() : '';
        const status = inferExpenseStatus(obs, value);

        parsedExpenses.push({
          id: `exp-imported-${rowIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          costType: costType,
          category: lastCategory,
          description: descStr,
          value: value,
          date: date,
          status: status,
          obs: obs,
          budgetMonth: budgetMonth
        });
      }
    }

    // --- LEITURA DE RECEITAS (Lado Direito) ---
    if (row.length > incColStart) {
      const incDescRaw = row[incColStart];
      const incValRaw = row[incColStart + 1];
      const incDateRaw = row[incColStart + 2];
      const incObsRaw = row[incColStart + 3];

      const incDescStr = String(incDescRaw || '').trim();

      // Valida se é uma linha de dados de receita legítima
      const isHeader = incDescStr.toLowerCase().includes('recebimento') || incDescStr.toLowerCase().includes('valor');
      const isTotal = incDescStr.toLowerCase().includes('total') || incDescStr.toLowerCase().includes('rest.');
      const hasData = incDescStr !== '' && !isHeader && !isTotal;

      if (hasData) {
        const value = parseNumericValue(incValRaw);
        const date = parseExcelDate(incDateRaw, budgetMonth);
        const obs = incObsRaw ? String(incObsRaw).trim() : '';

        parsedIncomes.push({
          id: `inc-imported-${rowIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          description: incDescStr,
          value: value,
          date: date,
          status: 'pago',
          obs: obs,
          budgetMonth: budgetMonth
        });
      }
    }
  });

  return { incomes: parsedIncomes, expenses: parsedExpenses };
}

// Auxiliar: Converte string/número do Excel para número decimal
function parseNumericValue(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  
  let str = String(val).trim();
  if (str === '-' || str === '') return 0;
  
  // Remove R$, pontos de milhar e substitui vírgula por ponto
  str = str.replace(/R\$\s?/g, '')
           .replace(/\./g, '')
           .replace(/,/g, '.')
           .trim();
           
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Auxiliar: Converte data do Excel (serial number ou string DD.MM) para YYYY-MM-DD
function parseExcelDate(dateVal, budgetMonth) {
  const currentYear = budgetMonth.split('/')[1] || new Date().getFullYear();
  const currentMonth = budgetMonth.split('/')[0];
  const defaultDate = `${currentYear}-${currentMonth}-01`;

  if (dateVal === undefined || dateVal === null || dateVal === '' || dateVal === '-') {
    return defaultDate;
  }
  
  if (typeof dateVal === 'number') {
    return convertExcelSerialToDate(dateVal);
  }
  
  const str = String(dateVal).trim();
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const cleanStr = str.replace(/\//g, '.');
  const parts = cleanStr.split('.');
  
  if (parts.length === 2) {
    const day = parts[0].trim().padStart(2, '0');
    const month = parts[1].trim().padStart(2, '0');
    return `${currentYear}-${month}-${day}`;
  } else if (parts.length === 3) {
    if (parts[0].length === 4) {
      // Formato YYYY.MM.DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
      // Formato DD.MM.YYYY
      let year = parts[2].trim();
      if (year.length === 2) year = '20' + year;
      return `${year}-${parts[1].trim().padStart(2, '0')}-${parts[0].trim().padStart(2, '0')}`;
    }
  }
  
  return defaultDate;
}

// Auxiliar: Converte número serial de data do Excel para String YYYY-MM-DD
function convertExcelSerialToDate(serial) {
  // Trata o bug do ano bissexto fictício do Excel de 1900
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  
  const year = date_info.getFullYear();
  const month = String(date_info.getMonth() + 1).padStart(2, '0');
  const day = String(date_info.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Auxiliar: Deduz o status com base no texto de Observações ou Valor
function inferExpenseStatus(obsStr, value) {
  if (value === 0) {
    if (obsStr && obsStr.toLowerCase().includes('sem internet')) return 'sem internet no momento';
  }
  
  if (!obsStr) return 'pendente';
  const str = obsStr.trim().toLowerCase();
  
  if (str === 'pago') return 'pago';
  if (str === 'agendado') return 'agendado';
  if (str.includes('sem recurso')) return 'sem recurso no mês';
  if (str.includes('sem internet')) return 'sem internet no momento';
  
  return 'pago';
}

// Inicializar app
window.addEventListener('DOMContentLoaded', init);

// ====================================================================
// =================== ANALYTICS DASHBOARD ============================
// ====================================================================

// Armazena instâncias dos gráficos Chart.js para destruir antes de recriar
const chartInstances = {};

// Paleta de cores premium para gráficos
const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9',
  '#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#06b6d4',
  '#a855f7', '#f97316', '#22d3ee', '#84cc16', '#e879f9'
];

// Configurações globais do Chart.js
function getChartDefaults() {
  return {
    color: '#94a3b8',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    font: { family: "'Plus Jakarta Sans', sans-serif" }
  };
}

// Popula os seletores de período do dashboard analytics
function populateAnalyticsSelectors() {
  const startSel = document.getElementById('analyticsRangeStart');
  const endSel = document.getElementById('analyticsRangeEnd');
  const months = new Set();

  state.incomes.forEach(item => {
    if (item.budgetMonth) {
      months.add(item.budgetMonth);
    }
  });
  state.expenses.forEach(item => {
    if (item.budgetMonth) {
      months.add(item.budgetMonth);
    }
  });
  if (months.size === 0) months.add('05/2026');

  const sorted = Array.from(months).sort((a, b) => {
    const [mA, yA] = a.split('/').map(Number);
    const [mB, yB] = b.split('/').map(Number);
    return yA !== yB ? yA - yB : mA - mB;
  });

  // Preservar seleção se já houver
  const prevStart = startSel.value;
  const prevEnd = endSel.value;

  startSel.innerHTML = '';
  endSel.innerHTML = '';
  sorted.forEach(m => {
    const opt1 = document.createElement('option');
    opt1.value = m;
    opt1.textContent = formatMonthName(m);
    startSel.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = m;
    opt2.textContent = formatMonthName(m);
    endSel.appendChild(opt2);
  });

  if (prevStart && sorted.includes(prevStart)) {
    startSel.value = prevStart;
  } else {
    startSel.value = sorted[0];
  }
  if (prevEnd && sorted.includes(prevEnd)) {
    endSel.value = prevEnd;
  } else {
    endSel.value = sorted[sorted.length - 1];
  }
}

// Obtém os meses no intervalo selecionado (ordenados)
function getAnalyticsMonthRange() {
  const startVal = document.getElementById('analyticsRangeStart').value;
  const endVal = document.getElementById('analyticsRangeEnd').value;

  const allMonths = new Set();
  state.incomes.forEach(i => { if (i.budgetMonth) allMonths.add(i.budgetMonth); });
  state.expenses.forEach(e => { if (e.budgetMonth) allMonths.add(e.budgetMonth); });

  const sorted = Array.from(allMonths).sort((a, b) => {
    const [mA, yA] = a.split('/').map(Number);
    const [mB, yB] = b.split('/').map(Number);
    return yA !== yB ? yA - yB : mA - mB;
  });

  const toNum = (str) => {
    const [m, y] = str.split('/').map(Number);
    return y * 100 + m;
  };

  const startNum = toNum(startVal);
  const endNum = toNum(endVal);

  return sorted.filter(m => {
    const n = toNum(m);
    return n >= startNum && n <= endNum;
  });
}

// Função principal que renderiza todo o dashboard analytics
function renderAnalytics() {
  const monthsInRange = getAnalyticsMonthRange();
  if (monthsInRange.length === 0) {
    showToast("Nenhum dado encontrado no período selecionado.", "info");
    return;
  }

  // Agregar dados por mês
  const monthlyData = monthsInRange.map(month => {
    const incomes = state.incomes.filter(i => i.budgetMonth === month);
    const expenses = state.expenses.filter(e => e.budgetMonth === month);
    const totalIncome = incomes.filter(i => i.status === 'pago').reduce((sum, i) => sum + i.value, 0);
    const totalExpense = expenses.reduce((sum, e) => sum + e.value, 0);
    return { month, totalIncome, totalExpense, balance: totalIncome - totalExpense, expenses, incomes };
  });

  // KPIs
  const totalIncome = monthlyData.reduce((s, d) => s + d.totalIncome, 0);
  const totalExpense = monthlyData.reduce((s, d) => s + d.totalExpense, 0);
  const totalBalance = totalIncome - totalExpense;
  const avgExpense = monthsInRange.length > 0 ? totalExpense / monthsInRange.length : 0;

  document.getElementById('anTotalIncome').textContent = formatCurrency(totalIncome);
  document.getElementById('anTotalExpense').textContent = formatCurrency(totalExpense);
  document.getElementById('anTotalBalance').textContent = formatCurrency(totalBalance);
  document.getElementById('anAvgExpense').textContent = formatCurrency(avgExpense);

  // Estilizar saldo
  const balEl = document.getElementById('anTotalBalance');
  balEl.style.color = totalBalance >= 0 ? 'var(--success)' : 'var(--danger)';

  // Coletar todas as despesas do período
  const allExpensesInRange = monthlyData.flatMap(d => d.expenses);

  // Renderizar cada gráfico
  renderChartIncomeExpense(monthlyData);
  renderChartBalanceLine(monthlyData);
  renderChartCategoryDoughnut(allExpensesInRange);
  renderChartFixoVariante(allExpensesInRange);
  renderChartTopExpenses(allExpensesInRange);
  renderChartStatusPie(allExpensesInRange);
  renderMonthlyResumeTable(monthlyData);
}

// Utilitário: destruir gráfico anterior e criar novo
function createChart(canvasId, config) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  const ctx = document.getElementById(canvasId).getContext('2d');
  const defaults = getChartDefaults();
  
  // Aplicar defaults globais
  if (!config.options) config.options = {};
  if (!config.options.plugins) config.options.plugins = {};
  if (!config.options.plugins.legend) config.options.plugins.legend = {};
  config.options.plugins.legend.labels = {
    ...config.options.plugins.legend.labels,
    color: defaults.color,
    font: { ...defaults.font, size: 12 }
  };
  config.options.responsive = true;
  config.options.maintainAspectRatio = false;

  chartInstances[canvasId] = new Chart(ctx, config);
  return chartInstances[canvasId];
}

// --- GRÁFICO 1: Receita vs Despesa (Bar) ---
function renderChartIncomeExpense(monthlyData) {
  const labels = monthlyData.map(d => formatMonthName(d.month));
  createChart('chartIncomeExpense', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Receita',
          data: monthlyData.map(d => d.totalIncome),
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.6,
        },
        {
          label: 'Despesa',
          data: monthlyData.map(d => d.totalExpense),
          backgroundColor: 'rgba(244, 63, 94, 0.7)',
          borderColor: '#f43f5e',
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.6,
        }
      ]
    },
    options: {
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.03)' }
        },
        y: {
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: v => 'R$ ' + v.toLocaleString('pt-BR')
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      }
    }
  });
}

// --- GRÁFICO 2: Evolução do Saldo (Line) ---
function renderChartBalanceLine(monthlyData) {
  const labels = monthlyData.map(d => formatMonthName(d.month));
  let cumulative = 0;
  const cumulativeData = monthlyData.map(d => {
    cumulative += d.balance;
    return cumulative;
  });

  createChart('chartBalanceLine', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Saldo Acumulado',
        data: cumulativeData,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: '#6366f1',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderWidth: 3,
      }]
    },
    options: {
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.03)' }
        },
        y: {
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: v => 'R$ ' + v.toLocaleString('pt-BR')
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `Saldo: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      }
    }
  });
}

// --- GRÁFICO 3: Despesas por Categoria (Doughnut) ---
function renderChartCategoryDoughnut(expenses) {
  const catSums = {};
  expenses.forEach(e => {
    const cat = (e.category || 'Outros');
    catSums[cat] = (catSums[cat] || 0) + e.value;
  });

  const sorted = Object.entries(catSums).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([cat]) => cat.charAt(0).toUpperCase() + cat.slice(1));
  const data = sorted.map(([, val]) => val);

  createChart('chartCategoryDoughnut', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS.slice(0, data.length),
        borderColor: '#060813',
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 12, usePointStyle: true, pointStyle: 'circle' }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${formatCurrency(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// --- GRÁFICO 4: Fixo vs Variante (Polar Area) ---
function renderChartFixoVariante(expenses) {
  const fixoVal = expenses.filter(e => e.costType === 'fixo').reduce((s, e) => s + e.value, 0);
  const varVal = expenses.filter(e => e.costType === 'variante').reduce((s, e) => s + e.value, 0);

  createChart('chartFixoVariante', {
    type: 'polarArea',
    data: {
      labels: ['Fixo', 'Variante'],
      datasets: [{
        data: [fixoVal, varVal],
        backgroundColor: ['rgba(14, 165, 233, 0.65)', 'rgba(245, 158, 11, 0.65)'],
        borderColor: ['#0ea5e9', '#f59e0b'],
        borderWidth: 2,
      }]
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 12, usePointStyle: true, pointStyle: 'circle' }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${formatCurrency(ctx.parsed.r)}`
          }
        }
      },
      scales: {
        r: {
          ticks: { display: false },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// --- GRÁFICO 5: Top 10 Maiores Despesas (Horizontal Bar) ---
function renderChartTopExpenses(expenses) {
  const sorted = [...expenses].sort((a, b) => b.value - a.value).slice(0, 10);
  const labels = sorted.map(e => e.description.length > 25 ? e.description.substring(0, 25) + '…' : e.description);
  const data = sorted.map(e => e.value);

  createChart('chartTopExpenses', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Valor',
        data,
        backgroundColor: CHART_COLORS.slice(0, data.length).map(c => c + 'CC'),
        borderColor: CHART_COLORS.slice(0, data.length),
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.7,
      }]
    },
    options: {
      indexAxis: 'y',
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: v => 'R$ ' + v.toLocaleString('pt-BR')
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${formatCurrency(ctx.parsed.x)}`
          }
        }
      }
    }
  });
}

// --- GRÁFICO 6: Status das Despesas (Pie) ---
function renderChartStatusPie(expenses) {
  const statusSums = {};
  expenses.forEach(e => {
    const st = e.status || 'pendente';
    statusSums[st] = (statusSums[st] || 0) + 1;
  });

  const statusColors = {
    'pago': '#10b981',
    'agendado': '#f59e0b',
    'pendente': '#f43f5e',
    'sem recurso no mês': '#0ea5e9',
    'sem internet no momento': '#8b5cf6'
  };

  const labels = Object.keys(statusSums);
  const data = Object.values(statusSums);
  const colors = labels.map(l => statusColors[l] || '#6366f1');

  createChart('chartStatusPie', {
    type: 'pie',
    data: {
      labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'AA'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 12, usePointStyle: true, pointStyle: 'circle' }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${ctx.parsed} itens`
          }
        }
      }
    }
  });
}

// --- TABELA RESUMO MENSAL ---
function renderMonthlyResumeTable(monthlyData) {
  const tbody = document.getElementById('tbodyMonthlyResume');
  tbody.innerHTML = '';

  monthlyData.forEach(d => {
    const tr = document.createElement('tr');
    tr.className = 'table-row-hover';
    const balanceClass = d.balance >= 0 ? 'text-success' : 'text-danger';
    tr.innerHTML = `
      <td class="text-bold">${formatMonthName(d.month)}</td>
      <td class="font-numeric text-success">${formatCurrency(d.totalIncome)}</td>
      <td class="font-numeric text-danger">${formatCurrency(d.totalExpense)}</td>
      <td class="font-numeric text-bold ${balanceClass}">${formatCurrency(d.balance)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Linha total
  const totalIncome = monthlyData.reduce((s, d) => s + d.totalIncome, 0);
  const totalExpense = monthlyData.reduce((s, d) => s + d.totalExpense, 0);
  const totalBalance = totalIncome - totalExpense;
  const balClass = totalBalance >= 0 ? 'text-success' : 'text-danger';

  const totalTr = document.createElement('tr');
  totalTr.className = 'summary-row';
  totalTr.innerHTML = `
    <td class="text-bold" style="color: var(--primary);">TOTAL</td>
    <td class="font-numeric text-bold text-success">${formatCurrency(totalIncome)}</td>
    <td class="font-numeric text-bold text-danger">${formatCurrency(totalExpense)}</td>
    <td class="font-numeric text-bold ${balClass}">${formatCurrency(totalBalance)}</td>
  `;
  tbody.appendChild(totalTr);
}
