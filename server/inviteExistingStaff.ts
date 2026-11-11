import { query, pg } from './db.js';
import { getSupabaseAdmin } from './supabase.js';

async function inviteExistingStaff() {
  const staff = await query<{ id: number; email: string; name: string; role: string; auth_user_id: string | null }>(
    `SELECT id, email, name, role, auth_user_id FROM staff
     WHERE is_active = true AND role <> 'super_admin'
     ORDER BY id`,
  );
  const admin = getSupabaseAdmin();
  const redirectTo = process.env.AUTH_REDIRECT_URL;
  let page = 1;
  let invited = 0;
  const authUsersByEmail = new Map<string, string>();

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) authUsersByEmail.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }

  for (const member of staff) {
    const existingAuthUserId = authUsersByEmail.get(member.email.toLowerCase());
    if (existingAuthUserId) {
      if (member.auth_user_id !== existingAuthUserId) {
        const linked = await query(
          `UPDATE staff SET auth_user_id = $1
           WHERE id = $2 AND (auth_user_id IS NULL OR auth_user_id = $1)
           RETURNING id`,
          [existingAuthUserId, member.id],
        );
        if (!linked.length) {
          throw new Error(`Staff account ${member.id} is already linked to a different Supabase Auth user.`);
        }
      }
      continue;
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(member.email, {
      data: { full_name: member.name, staff_id: member.id, staff_role: member.role },
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (error) {
      throw new Error(`Could not invite staff account ${member.id}: ${error.message}`, { cause: error });
    }
    if (data.user.email) authUsersByEmail.set(data.user.email.toLowerCase(), data.user.id);
    const linked = await query(
      `UPDATE staff SET auth_user_id = $1
       WHERE id = $2 AND (auth_user_id IS NULL OR auth_user_id = $1)
       RETURNING id`,
      [data.user.id, member.id],
    );
    if (!linked.length) {
      throw new Error(`Staff account ${member.id} is already linked to a different Supabase Auth user.`);
    }
    invited += 1;
    console.log(`Sent Supabase Auth invitation for staff account ${member.id}.`);
  }

  console.log(`Invited ${invited} staff member(s). Existing Auth accounts were left unchanged.`);
}

inviteExistingStaff()
  .catch((error: unknown) => {
    console.error('[nile] could not invite existing staff:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.end();
  });
