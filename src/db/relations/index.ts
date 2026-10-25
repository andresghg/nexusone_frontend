import { defineRelations } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import * as schema from "../schema";

export const relations = defineRelations({ ...schema, authUsers }, (r) => ({
  authUsers: {
    profile: r.one.profiles({
      from: r.authUsers.id,
      to: r.profiles.id,
    }),
    memberships: r.many.organizationMembers({
      from: r.authUsers.id,
      to: r.organizationMembers.userId,
    }),
    ownedOrganizations: r.many.organizations({
      from: r.authUsers.id,
      to: r.organizations.ownerUserId,
    }),
  },

  profiles: {
    user: r.one.authUsers({
      from: r.profiles.id,
      to: r.authUsers.id,
    }),
  },

  organizations: {
    owner: r.one.profiles({
      from: r.organizations.ownerUserId,
      to: r.profiles.id,
    }),
    members: r.many.organizationMembers({
      from: r.organizations.id,
      to: r.organizationMembers.organizationId,
    }),
    modules: r.many.organizationModules({
      from: r.organizations.id,
      to: r.organizationModules.organizationId,
    }),
  },

  organizationMembers: {
    organization: r.one.organizations({
      from: r.organizationMembers.organizationId,
      to: r.organizations.id,
    }),
    profile: r.one.profiles({
      from: r.organizationMembers.userId,
      to: r.profiles.id,
    }),
  },

  organizationModules: {
    organization: r.one.organizations({
      from: r.organizationModules.organizationId,
      to: r.organizations.id,
    }),
  },
}));