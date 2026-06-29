'use client'
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { approveMember } from '../actions/admin';

export default function AdminDashboard() {
  const supabase = createClientComponentClient();
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    fetchPendingMembers();
  }, []);

  async function fetchPendingMembers() {
    const { data } = await supabase.from('members').select('*').eq('status', 'pending');
    if (data) setMembers(data);
  }

  async function handleApprove(id: string) {
    const result = await approveMember(id);
    if (result.success) {
      alert("Member approved!");
      fetchPendingMembers(); // Refresh the list
    } else {
      alert("Error approving member.");
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">PLP Gisenyi Admin Dashboard</h1>
      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Name</th>
            <th className="border p-2">Email</th>
            <th className="border p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td className="border p-2">{m.full_name}</td>
              <td className="border p-2">{m.email}</td>
              <td className="border p-2">
                <button 
                  onClick={() => handleApprove(m.id)}
                  className="bg-green-600 text-white px-3 py-1 rounded"
                >
                  Approve
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
