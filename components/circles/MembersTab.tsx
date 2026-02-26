'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Member {
  id: string
  name: string
  email: string
  role: 'owner' | 'member'
}

interface MembersTabProps {
  members: Member[]
}

export function MembersTab({ members }: MembersTabProps) {
  const currentUrl = typeof window !== 'undefined'
    ? window.location.pathname + window.location.search
    : '/dashboard'
  const returnTo = encodeURIComponent(currentUrl)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 text-brand-carbon">
        Circle Members ({members.length})
      </h2>
      <div className="space-y-2">
        {members.map((member) => (
          <Link key={member.id} href={`/members/${member.id}?returnTo=${returnTo}`}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-brand-sand/70 flex items-center justify-center">
                      <span className="text-brand-carbon/70 font-medium">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-brand-carbon/60">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-carbon/60">View profile</span>
                    {member.role === 'owner' && (
                      <Badge>Circle Leader</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
