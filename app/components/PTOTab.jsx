'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getMyLeaveBalances,
  getEmployeeLeaveRequests,
  requestLeave,
  approveLeave,
  rejectLeave,
  getPendingRequests,
  getLeaveTypes,
  getLeaveCalendar,
  calculateLeaveDays,
  checkRosterConflicts,
} from '../../lib/useLeave';

const uid = () => Math.random().toString(36).slice(2, 8);

// ── Toast Notification Component ─────────────────────────────────────────────

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

// ── Modal Component ──────────────────────────────────────────────────────────

function Modal({ title, isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex justify-between items-center border-b p-6">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Leave Balance Card Component ──────────────────────────────────────────────

function LeaveBalanceCard({ leaveType, balance, used, available }) {
  const percentage = balance > 0 ? Math.round((used / balance) * 100) : 0;

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <h4 className="font-semibold text-gray-900">{leaveType.name}</h4>
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ backgroundColor: leaveType.color }}
        />
      </div>

      <div className="mb-3">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${percentage}%`,
              backgroundColor: leaveType.color,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <div className="text-gray-500 text-xs">Used</div>
          <div className="text-lg font-semibold text-gray-900">{used}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Available</div>
          <div className="text-lg font-semibold text-green-600">{available}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Total</div>
          <div className="text-lg font-semibold text-gray-900">{balance}</div>
        </div>
      </div>

      {!leaveType.paid && <div className="mt-2 text-xs text-gray-500">Unpaid</div>}
    </div>
  );
}

// ── My Leave Tab ──────────────────────────────────────────────────────────────

function MyLeaveTab({ employeeId, year, onRefresh }) {
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [bal, req] = await Promise.all([
          getMyLeaveBalances(employeeId, year),
          getEmployeeLeaveRequests(employeeId, year),
        ]);
        setBalances(bal);
        setRequests(req.filter((r) => r.status === 'approved'));
      } catch (err) {
        console.error('Failed to load leave data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [employeeId, year, onRefresh]);

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Current Balances ({year})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {balances.map((bal) => (
            <LeaveBalanceCard
              key={bal.id}
              leaveType={bal.leaveType}
              balance={bal.balance}
              used={bal.used}
              available={bal.available}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Upcoming Approved Leave</h3>
        {requests.length === 0 ? (
          <p className="text-gray-500">No approved leave scheduled</p>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <div key={req.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{req.leaveType.name}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(req.startDate).toLocaleDateString()} -{' '}
                      {new Date(req.endDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-500">{req.daysRequested} days</p>
                  </div>
                  <span className="inline-block px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded-full">
                    Approved
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Request Leave Tab ────────────────────────────────────────────────────────

function RequestLeaveTab({ employeeId, onRefresh }) {
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [daysCalculated, setDaysCalculated] = useState(0);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [availableBalance, setAvailableBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const loadLeaveTypes = async () => {
      try {
        const types = await getLeaveTypes();
        setLeaveTypes(types);
        if (types.length > 0) setSelectedType(types[0].id);
      } catch (err) {
        console.error('Failed to load leave types:', err);
      }
    };

    loadLeaveTypes();
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      const days = calculateLeaveDays(startDate, endDate);
      setDaysCalculated(days);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    const checkBalance = async () => {
      if (selectedType && startDate && endDate) {
        try {
          const year = new Date(startDate).getFullYear();
          const balances = await getMyLeaveBalances(employeeId, year);
          const balance = balances.find((b) => b.leaveType.id === selectedType);
          if (balance) {
            setAvailableBalance(balance.available);
          }

          // Check conflicts
          const conflicts = await checkRosterConflicts(employeeId, startDate, endDate);
          setConflict(conflicts.length > 0 ? conflicts : null);
        } catch (err) {
          console.error('Failed to check balance:', err);
        }
      }
    };

    checkBalance();
  }, [selectedType, startDate, endDate, employeeId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedType || !startDate || !endDate) {
      setToast({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }

    if (daysCalculated > availableBalance && availableBalance > 0) {
      setToast({ message: 'Insufficient leave balance', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      await requestLeave(employeeId, selectedType, startDate, endDate, reason, notes);
      setToast({ message: 'Leave request submitted successfully', type: 'success' });
      setStartDate('');
      setEndDate('');
      setReason('');
      setNotes('');
      onRefresh();
    } catch (err) {
      setToast({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const selectedLeaveType = leaveTypes.find((t) => t.id === selectedType);

  return (
    <form onSubmit={handleSubmit} className="p-6 max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Leave Type *</label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {leaveTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} {!type.paid ? '(Unpaid)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">End Date *</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {daysCalculated > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>{daysCalculated} days</strong> selected (excluding weekends)
          </p>
          <p className="text-sm text-blue-700">
            Available: <strong>{availableBalance} days</strong>
          </p>
        </div>
      )}

      {conflict && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-medium text-amber-900">
            ⚠ Roster Conflicts Detected
          </p>
          <p className="text-sm text-amber-800">
            {conflict.length} assignment(s) on requested dates will be affected
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., Personal, Medical, etc."
          className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional information..."
          rows={3}
          className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </form>
  );
}

// ── Pending Requests Tab ──────────────────────────────────────────────────────

function PendingRequestsTab({ onRefresh }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [removeConflicts, setRemoveConflicts] = useState(false);
  const [toast, setToast] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);

  useEffect(() => {
    const loadRequests = async () => {
      try {
        const pending = await getPendingRequests();
        setRequests(pending);
      } catch (err) {
        console.error('Failed to load pending requests:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRequests();
  }, [onRefresh]);

  const handleApprove = async () => {
    if (!selectedRequest) return;

    try {
      await approveLeave(selectedRequest.id, 'admin', removeConflicts);
      setToast({ message: 'Leave approved successfully', type: 'success' });
      setRequests(requests.filter((r) => r.id !== selectedRequest.id));
      setShowConflictModal(false);
      setSelectedRequest(null);
      onRefresh();
    } catch (err) {
      if (err.message.includes('Roster conflicts')) {
        setShowConflictModal(true);
      } else {
        setToast({ message: `Error: ${err.message}`, type: 'error' });
      }
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;

    try {
      await rejectLeave(selectedRequest.id, 'admin', rejectReason);
      setToast({ message: 'Leave rejected successfully', type: 'success' });
      setRequests(requests.filter((r) => r.id !== selectedRequest.id));
      setShowRejectModal(false);
      setSelectedRequest(null);
      onRefresh();
    } catch (err) {
      setToast({ message: `Error: ${err.message}`, type: 'error' });
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-lg font-semibold">Pending Leave Requests ({requests.length})</h3>

      {requests.length === 0 ? (
        <p className="text-gray-500">No pending requests</p>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{req.employee.name}</p>
                  <p className="text-sm text-gray-600">{req.leaveType.name}</p>
                </div>
                <span
                  className="inline-block px-2 py-1 text-xs font-semibold text-white rounded"
                  style={{ backgroundColor: req.leaveType.color }}
                >
                  {req.daysRequested} days
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-3">
                {new Date(req.startDate).toLocaleDateString()} -{' '}
                {new Date(req.endDate).toLocaleDateString()}
              </p>

              {req.notes && <p className="text-sm text-gray-600 mb-3 italic">{req.notes}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedRequest(req);
                    handleApprove();
                  }}
                  className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                >
                  Approve
                </button>
                <button
                  onClick={() => {
                    setSelectedRequest(req);
                    setShowRejectModal(true);
                  }}
                  className="flex-1 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="Reject Leave Request"
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
      >
        <div className="space-y-4">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            rows={3}
            className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setShowRejectModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Reject
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        title="Roster Conflicts"
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This employee has assignments scheduled on the requested leave dates.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={removeConflicts}
              onChange={(e) => setRemoveConflicts(e.target.checked)}
              className="w-4 h-4 border border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">Remove conflicting assignments</span>
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setShowConflictModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Approve
            </button>
          </div>
        </div>
      </Modal>

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

// ── Leave Calendar Tab ────────────────────────────────────────────────────────

function LeaveCalendarTab({ year, month }) {
  const [calendar, setCalendar] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCalendar = async () => {
      try {
        const cal = await getLeaveCalendar(year, month);
        setCalendar(cal);
      } catch (err) {
        console.error('Failed to load calendar:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCalendar();
  }, [year, month]);

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading...</div>;
  }

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const days = [];

  for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="bg-white p-3 text-center font-semibold text-gray-700 text-sm">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200 auto-rows-[100px]">
          {days.map((day) => {
            const dateKey = day.toISOString().split('T')[0];
            const dayLeave = calendar[dateKey] || [];
            const isCurrentMonth = day.getMonth() === month;
            const dayName = day.getDate();

            return (
              <div
                key={dateKey}
                className={`p-2 min-h-full ${
                  isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                } ${day.getDay() === 0 || day.getDay() === 6 ? 'bg-gray-100' : ''}`}
              >
                <div className="text-sm font-medium text-gray-700 mb-1">{dayName}</div>
                <div className="space-y-1">
                  {dayLeave.map((leave, idx) => (
                    <div
                      key={idx}
                      className="text-xs px-1 py-0.5 rounded text-white truncate"
                      style={{ backgroundColor: leave.leaveColor }}
                      title={`${leave.employeeName} - ${leave.leaveType}`}
                    >
                      {leave.employeeName}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main PTOTab Component ────────────────────────────────────────────────────

export default function PTOTab({ employeeId = 'emp-1', userRole = 'employee' }) {
  const [activeTab, setActiveTab] = useState('my-leave');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  const tabs = [
    { id: 'my-leave', label: 'My Leave', role: ['employee', 'manager', 'admin'] },
    { id: 'request', label: 'Request Leave', role: ['employee', 'manager', 'admin'] },
    { id: 'pending', label: 'Pending Requests', role: ['manager', 'admin'] },
    { id: 'calendar', label: 'Leave Calendar', role: ['manager', 'admin'] },
  ];

  const visibleTabs = tabs.filter((t) => t.role.includes(userRole));

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Tabs Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex gap-1 p-4">
          {visibleTabs.map((tab) => (
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

        {/* Year/Month Selector */}
        {['calendar'].includes(activeTab) && (
          <div className="flex gap-4 px-4 pb-4 text-sm">
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="p-2 border border-gray-300 rounded-lg"
            >
              {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {['calendar'].includes(activeTab) && (
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="p-2 border border-gray-300 rounded-lg"
              >
                {[
                  'January',
                  'February',
                  'March',
                  'April',
                  'May',
                  'June',
                  'July',
                  'August',
                  'September',
                  'October',
                  'November',
                  'December',
                ].map((m, idx) => (
                  <option key={idx} value={idx}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'my-leave' && (
          <MyLeaveTab
            key={refreshKey}
            employeeId={employeeId}
            year={year}
            onRefresh={handleRefresh}
          />
        )}
        {activeTab === 'request' && (
          <RequestLeaveTab
            key={refreshKey}
            employeeId={employeeId}
            onRefresh={handleRefresh}
          />
        )}
        {activeTab === 'pending' && (
          <PendingRequestsTab key={refreshKey} onRefresh={handleRefresh} />
        )}
        {activeTab === 'calendar' && (
          <LeaveCalendarTab year={year} month={month} />
        )}
      </div>
    </div>
  );
}
