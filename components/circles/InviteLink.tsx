'use client'

export function InviteLink({ inviteLink }: { inviteLink: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Link</h3>
      <div className="space-y-2">
        <p className="text-sm text-gray-600 mb-2">Share this link to invite friends:</p>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            readOnly
            value={inviteLink}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50"
          />
          <button
            onClick={handleCopy}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}

