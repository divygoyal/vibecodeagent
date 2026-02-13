"""multi_provider_schema

Revision ID: multi_provider_v2
Revises: previous_revision
Create Date: 2026-02-13 21:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = 'multi_provider_v2'
down_revision = None  # We'll need to check the actual previous revision if using real alembic
branch_labels = None
depends_on = None

def upgrade():
    # 1. Create oauth_connections table
    op.create_table('oauth_connections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('provider_account_id', sa.String(length=255), nullable=False),
        sa.Column('access_token', sa.Text(), nullable=True),
        sa.Column('refresh_token', sa.Text(), nullable=True),
        sa.Column('expires_at', sa.Integer(), nullable=True),
        sa.Column('token_type', sa.String(length=50), nullable=True),
        sa.Column('scope', sa.Text(), nullable=True),
        sa.Column('id_token', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_oauth_connections_user_id'), 'oauth_connections', ['user_id'], unique=False)

    # 2. Data Migration: Move existing github_token to oauth_connections
    conn = op.get_bind()
    # Fetch existing users with github_id and github_token
    users = conn.execute(sa.text("SELECT id, github_id, github_token, github_username FROM users WHERE github_id IS NOT NULL")).fetchall()
    
    for user in users:
        if user.github_id:
            conn.execute(
                sa.text("INSERT INTO oauth_connections (user_id, provider, provider_account_id, access_token, created_at, updated_at) VALUES (:uid, 'github', :pid, :token, NOW(), NOW())"),
                {"uid": user.id, "pid": user.github_id, "token": user.github_token}
            )

    # 3. Modify Users table
    # Make github_id nullable
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('github_id',
               existing_type=sa.VARCHAR(length=50),
               nullable=True)
        batch_op.alter_column('github_username',
               existing_type=sa.VARCHAR(length=100),
               nullable=True)
        # Ensure email is indexed if not already
        # batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)


def downgrade():
    # Reverse changes
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('github_username',
               existing_type=sa.VARCHAR(length=100),
               nullable=True)
        batch_op.alter_column('github_id',
               existing_type=sa.VARCHAR(length=50),
               nullable=False)

    op.drop_index(op.f('ix_oauth_connections_user_id'), table_name='oauth_connections')
    op.drop_table('oauth_connections')
