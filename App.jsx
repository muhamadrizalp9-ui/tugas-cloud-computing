import React, { useState, useMemo, useEffect } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Trash2, 
  PieChart as PieIcon, 
  LayoutDashboard,
  Settings,
  Bell,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];
const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Shopping', 'Bills', 'Others'];

const FinanceFlow = () => {
  // Mengelola data mentah transaksi (Simulasi Service A)
  const [transactions, setTransactions] = useState([
    { id: 1, text: 'Lunch at Cafe', amount: -150000, category: 'Food', date: '2023-10-20' },
    { id: 2, text: 'Freelance Pay', amount: 5000000, category: 'Others', date: '2023-10-21' },
    { id: 3, text: 'Netflix Subscription', amount: -186000, category: 'Entertainment', date: '2023-10-22' },
    { id: 4, text: 'Gasoline', amount: -200000, category: 'Transport', date: '2023-10-23' },
  ]);

  // Mengelola batasan anggaran (Simulasi Service B)
  const [budgets, setBudgets] = useState({
    Food: 2000000,
    Transport: 1000000,
    Entertainment: 500000,
    Shopping: 1500000,
    Bills: 3000000,
    Others: 1000000
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [formData, setFormData] = useState({ text: '', amount: '', category: 'Food' });

  const stats = useMemo(() => {
    const income = transactions
      .filter(t => t.amount > 0)
      .reduce((acc, t) => acc + t.amount, 0);
    const expenses = transactions
      .filter(t => t.amount < 0)
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const balance = income - expenses;

    // Menghitung pengeluaran per kategori untuk chart
    const categoryData = CATEGORIES.map(cat => {
      const total = transactions
        .filter(t => t.category === cat && t.amount < 0)
        .reduce((acc, t) => acc + Math.abs(t.amount), 0);
      return { name: cat, value: total };
    }).filter(item => item.value > 0);

    return { income, expenses, balance, categoryData };
  }, [transactions]);

  const handleAddTransaction = (e) => {
    e.preventDefault();
    if (!formData.text || !formData.amount) return;

    const newTransaction = {
      id: Date.now(),
      text: formData.text,
      amount: parseFloat(formData.amount),
      category: formData.category,
      date: new Date().toISOString().split('T')[0]
    };

    setTransactions([newTransaction, ...transactions]);
    setFormData({ text: '', amount: '', category: 'Food' });
  };

  const deleteTransaction = (id) => {
    setTransactions(transactions.filter(t => t.id !== id));
  };

  const formatIDR = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col p-6 hidden md:flex">
        <div className="flex items-center gap-2 mb-10">
          <div className="bg-indigo-600 p-2 rounded-xl">
            <Wallet className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">FinanceFlow</h1>
        </div>

        <nav className="space-y-2 flex-1">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <LayoutDashboard size={20} />
            <span className="font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('transactions')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'transactions' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <PieIcon size={20} />
            <span className="font-medium">Transactions</span>
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50">
            <Settings size={20} />
            <span className="font-medium">Settings</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-200 px-8 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
            <p className="text-xs text-slate-400">Welcome back, Admin</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-full relative">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold border border-indigo-200">
              AD
            </div>
          </div>
        </header>

        <main className="p-8 max-w-6xl mx-auto">
          {activeTab === 'dashboard' ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-transform hover:scale-[1.02]">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                      <TrendingUp size={24} />
                    </div>
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">+12%</span>
                  </div>
                  <p className="text-sm text-slate-500 mb-1">Total Income</p>
                  <h3 className="text-2xl font-bold">{formatIDR(stats.income)}</h3>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-transform hover:scale-[1.02]">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                      <TrendingDown size={24} />
                    </div>
                    <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2 py-1 rounded-full">+4%</span>
                  </div>
                  <p className="text-sm text-slate-500 mb-1">Total Expenses</p>
                  <h3 className="text-2xl font-bold">{formatIDR(stats.expenses)}</h3>
                </div>

                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-2xl shadow-lg shadow-indigo-200 text-white transition-transform hover:scale-[1.02]">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-white/20 backdrop-blur-md rounded-lg">
                      <Wallet size={24} />
                    </div>
                  </div>
                  <p className="text-sm text-indigo-100 mb-1">Total Balance</p>
                  <h3 className="text-2xl font-bold">{formatIDR(stats.balance)}</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Chart Area */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h4 className="text-lg font-bold mb-6">Expense Distribution</h4>
                  <div className="h-64">
                    {stats.categoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {stats.categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400">No data available</div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {stats.categoryData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                        <span className="text-[10px] text-slate-500 truncate">{entry.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Add Form */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h4 className="text-lg font-bold mb-6">New Transaction</h4>
                  <form onSubmit={handleAddTransaction} className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Description</label>
                      <input 
                        type="text" 
                        value={formData.text}
                        onChange={(e) => setFormData({...formData, text: e.target.value})}
                        placeholder="e.g. Shopping Mall"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Amount (IDR)</label>
                        <input 
                          type="number" 
                          value={formData.amount}
                          onChange={(e) => setFormData({...formData, amount: e.target.value})}
                          placeholder="e.g. -50000"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Category</label>
                        <select 
                          value={formData.category}
                          onChange={(e) => setFormData({...formData, category: e.target.value})}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all appearance-none"
                        >
                          {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                      </div>
                    </div>
                    <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 active:scale-[0.98]">
                      <Plus size={20} /> Add Transaction
                    </button>
                    <p className="text-[10px] text-slate-400 text-center italic mt-2">*Use negative value for expenses, positive for income.</p>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h4 className="text-lg font-bold">Transaction History</h4>
                <div className="text-sm text-slate-400">{transactions.length} items</div>
              </div>
              <div className="divide-y divide-slate-50">
                {transactions.map((t) => (
                  <div key={t.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${t.amount < 0 ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                        {t.amount < 0 ? <ArrowDownRight size={24} /> : <ArrowUpRight size={24} />}
                      </div>
                      <div>
                        <h5 className="font-semibold text-slate-800">{t.text}</h5>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{t.date}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">{t.category}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className={`font-bold text-lg ${t.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {t.amount < 0 ? '-' : '+'}{formatIDR(Math.abs(t.amount))}
                      </span>
                      <button 
                        onClick={() => deleteTransaction(t.id)}
                        className="text-slate-300 hover:text-rose-500 transition-colors p-2"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {transactions.length === 0 && (
                <div className="p-20 text-center text-slate-400">
                  <PieIcon size={48} className="mx-auto mb-4 opacity-20" />
                  <p>No transactions found. Start by adding one!</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default FinanceFlow;