'use client';

import { useState, useEffect } from 'react';
import { getLeaveTypes, createLeaveType } from '../lib/useLeave';
import {
  getLeaveBalanceReport,
  processAllEmployeeAccruals,
  grantLeave,
  getLeaveMetrics,
} from '../lib/leaveAccrual';

function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor =
    type === 'success'
      ? 'bg-green-100 text-green-800'
      : type === 'error'
        ? 'bg-red-100 text-red-800'
        : 'bg-blue-100 text-blue-800';

  return (
    <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg ${bgColor} z-50`}>
      {message}
    </div>
  );
}

// ── Leave Types Manager ──────────────────────────────────────────────────────

function LeaveTypesTab() {
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState({
    name: '',
    color: '#6366f1',
    paid: true,
    daysPerYear: 0,
    requiresApproval: true,
  });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const loadTypes = async () => {
      try {
        const types = await getLeaveTypes();
        setLeaveTypes(types);
      } catch (err) {
        setToast({ message: 'Failed to load leave types', type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    loadTypes();
  }, []);

  const handleCreateType = async (e) => {
    e.preventDefault();
    if (!newType.name) {
      setToast({ message: 'Leave type name is required', type: 'error' });
      return;
    }

    try {
      await createLeaveType(
        newType.name,
        newType.color,
        newType.paid,
        newType.daysPerYear,
        newType.requiresApproval
      );
      setToast({ message: 'Leave type created successfully', type: 'success' });
      setNewType({
        name: '',
        color: '#6366f1',
        paid: true,
        daysPerYear: 0,
        requiresApproval: true,
      });
      const types = await getLeaveTypes();
      setLeaveTypes(types);
    } catch (err) {
      setToast({ message: `Error: ${err.message}`, type: 'error' });
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Current Leave Types</h3>
        <div className="space-y-2">
          {leaveTypes.map((type) => (
            <div
              key={type.id}
              className="p-4 bg-white border border-gray-200 rounded-lg flex justify-between items-center"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: type.color }}
                />
                <div>
                  <p className="font-semibold text-gray-900">{type.name}</p>
                  <p className="text-sm text-gray-500">
                    {type.days_per_year} days/year
                    {!type.paid ? ' • Unpaid' : ' • Paid'}
                    {type.requires_approval ? ' • Requires Approval' : ' • Auto-approved'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">Create New Leave Type</h3>
        <form onSubmit={handleCreateType} className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type Name *
            </label>
            <input
              type="text"
              value={newType.name}
              onChange={(e) => setNewType({ ...newType, name: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <input
              type="color"
              value={newType.color}
              onChange={(e) => setNewType({ ...newType, color: e.target.value })}
              className="w-12 h-10 border border-gray-300 rounded-lg cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Days per Year
              </label>
              <input
                type="number"
                min="0"
                value={newType.daysPerYear}
                onChange={(e) =>
                  setNewType({ ...newType, daysPerYear: parseInt(e.target.value) || 0 })
                }
                className="w-full p-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Paid</label>
              <select
                value={newType.paid}
                onChange={(e) => setNewType({ ...newType, paid: e.target.value === 'true' })}
                className="w-full p-2 border border-gray-300 rounded-lg"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newType.requiresApproval}
                onChange={(e) =>
                  setNewType({ ...newType, requiresApproval: e.target.checked })
                }
                className="w-4 h-4 border border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Requires Approval</span>
            </label>
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Create Leave Type
          </button>
        </form>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ── Leave Balances Manager ───────────────────────────────────────────────────

function LeaveBalancesTab() {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [rep, met] = await Promise.all([
          getLeaveBalanceReport(year),
          getLeaveMetrics(year),
        ]);
        setReport(rep);
        setMetrics(met);
      } catch (err) {
        setToast({ message: 'Failed to load balance report', type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [year]);

  const handleProcessAccruals = async () => {
    setProcessing(true);
    try {
      const result = await processAllEmployeeAccruals(year);
      setToast({
        message: `Accruals processed: ${result.success.length} successful${
          result.failed.length > 0 ? `, ${result.failed.length} failed` : ''
        }`,
        type: 'success',
      });
      const [rep, met] = await Promise.all([
        getLeaveBalanceReport(year),
        getLeaveMetrics(year),
      ]);
      setReport(rep);
      setMetrics(met);
    } catch (err) {
      setToast({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Year Selector & Actions */}
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <select
            value={year}
            onChange={(e) => {
              setYear(parseInt(e.target.value));
              setLoading(true);
            }}
            className="p-2 border border-gray-300 rounded-lg"
          >
            {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleProcessAccruals}
          disabled={processing}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
        >
          {processing ? 'Processing...' : 'Process Annual Accrual'}
        </button>
      </div>

      {/* Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-500">Total Employees</p>
            <p className="text-2xl font-semibold text-gray-900">{metrics.totalEmployees}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-500">Total Balance</p>
            <p className="text-2xl font-semibold text-gray-900">{metrics.totalBalanced}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-500">Total Used</p>
            <p className="text-2xl font-semibold text-red-600">{metrics.totalUsed}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-500">Available</p>
            <p className="text-2xl font-semibold text-green-600">{metrics.totalAvailable}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-500">Avg Usage</p>
            <p className="text-2xl font-semibold text-gray-900">{metrics.averageUsage}%</p>
          </div>
        </div>
      )}

      {/* Balance Report Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-900">Employee</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-900">Type</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-900">Balance</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-900">Used</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-900">Available</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-900">Usage %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {report.map((row) => (
              <tr key={`${row.employeeId}-${row.leaveTypeId}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900 font-medium">{row.employeeName}</td>
                <td className="px-4 py-3 text-gray-600">{row.leaveType}</td>
                <td className="px-4 py-3 text-right text-gray-900">{row.balance}</td>
                <td className="px-4 py-3 text-right text-red-600">{row.used}</td>
                <td className="px-4 py-3 text-right text-green-600">{row.available}</td>
                <td className="px-4 py-3 text-right text-gray-900">{row.percentageUsed}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ── Main Admin Component ─────────────────────────────────────────────────────

export default function LeaveAdminPanel() {
  const [activeTab, setActiveTab] = useState('balances');

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="flex gap-1 p-4">
          {[
            { id: 'balances', label: 'Leave Balances' },
            { id: 'types', label: 'Leave Types' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'balances' && <LeaveBalancesTab />}
        {activeTab === 'types' && <LeaveTypesTab />}
      </div>
    </div>
  );
}
