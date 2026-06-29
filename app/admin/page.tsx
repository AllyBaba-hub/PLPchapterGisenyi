'use client'
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { approveMember } from '../actions/admin';

export default function AdminDashboard() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    fetchPendingMembers();
  }, []);

  async function fetchPendingMembers() {
    const { data } = await supabase.from('members').select('*').eq('status', 'pending');
    if (data) setMembers(data);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleApprove(id: string) {
    const result = await approveMember(id);
    if (result.success) {
      alert("Member approved successfully.");
      fetchPendingMembers();
    } else {
      alert("Error: " + result.error);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">PLP Gisenyi Admin Dashboard</h1>
        <button 
          onClick={handleLogout}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Logout
        </button>
      </div>
      
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Email</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr><td colSpan={3} className="p-4 text-center text-gray-500">No pending members.</td></tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="p-4">{m.full_name}</td>
                  <td className="p-4">{m.email}</td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => handleApprove(m.id)}
                      className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                    >
                      Approve
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
