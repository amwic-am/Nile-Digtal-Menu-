import { pg } from './db.js';
import { findAuthUser, getSupabaseAdmin } from './supabase.js';

async function updateAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const resetPassword = process.env.RESET_ADMIN_PASSWORD === 'true';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set INITIAL_ADMIN_EMAIL to a valid email address.');
  }
  if (password && password.length < 16) {
    throw new Error('If set, INITIAL_ADMIN_PASSWORD must be a unique password with at least 16 characters.');
  }

  const client = await pg.connect();
  try {
    const admins = await client.query<{ id: number; email: string; auth_user_id: string | null }>(
      "SELECT id, email, auth_user_id FROM staff WHERE role = 'super_admin'",
    );
    if (admins.rowCount !== 1) {
      throw new Error(`Expected exactly one super-admin staff record; found ${admins.rowCount ?? 0}. No account was changed.`);
    }

    const adminStaff = admins.rows[0];
    const duplicate = await client.query(
      'SELECT 1 FROM staff WHERE lower(email) = lower($1) AND id <> $2',
      [email, adminStaff.id],
    );
    if (duplicate.rowCount) {
      throw new Error('That email is already assigned to another staff member.');
    }

    const authAdmin = getSupabaseAdmin();
    let authUser = await findAuthUser(adminStaff.email, adminStaff.id, adminStaff.auth_user_id ?? undefined);
    const conflictingAuthUser = await findAuthUser(email);
    if (conflictingAuthUser && conflictingAuthUser.id !== authUser?.id) {
      const alreadyLinked = await client.query(
        'SELECT id FROM staff WHERE auth_user_id = $1 AND id <> $2',
        [conflictingAuthUser.id, adminStaff.id],
      );
      if (alreadyLinked.rowCount) {
        throw new Error('The requested Supabase Auth account is already linked to another staff record.');
      }
      authUser = conflictingAuthUser;
    }

    if (authUser) {
      const { error } = await authAdmin.auth.admin.updateUserById(authUser.id, {
        email,
        email_confirm: true,
        user_metadata: { full_name: 'Abel Mesfin', staff_id: adminStaff.id },
        ...(resetPassword && password ? { password } : {}),
      });
      if (error) throw error;
    } else {
      if (!password) {
        throw new Error('No matching Supabase Auth account exists. Set INITIAL_ADMIN_PASSWORD to create one.');
      }
      const { error } = await authAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Abel Mesfin', staff_id: adminStaff.id },
      });
      if (error) throw error;
    }

    const updated = await client.query(
      "UPDATE staff SET email = $1, auth_user_id = $2, is_active = true, password_hash = NULL WHERE id = $3",
      [email, authUser?.id ?? null, adminStaff.id],
    );
    if (updated.rowCount !== 1) {
      throw new Error('Supabase Auth was updated, but the staff record could not be updated. Check the database before retrying.');
    }
  } finally {
    client.release();
  }
}

updateAdmin()
  .then(() => {
    console.log(
      process.env.RESET_ADMIN_PASSWORD === 'true'
        ? 'Linked and activated the super-admin Supabase Auth account and reset its password.'
        : 'Linked and activated the super-admin Supabase Auth account. The existing password was left unchanged.',
    );
  })
  .catch((error: unknown) => {
    console.error('[nile] could not update admin credentials:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.end();
  });
