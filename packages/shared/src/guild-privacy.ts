import type { GuildState } from './types.ts';

const ANONYMIZED_NAME = 'Deleted user';
const REMOVED_CONTENT = 'Removed following a personal-data deletion request.';

export function anonymizeGuildUserData(guild: GuildState, userId: string): GuildState {
  const updated = structuredClone(guild);
  const removedReminderIds = new Set(
    updated.reminders.filter((reminder) => reminder.userId === userId).map((reminder) => reminder.id),
  );
  const removedTemporaryRoleIds = new Set(
    updated.temporaryRoles.filter((grant) => grant.userId === userId).map((grant) => grant.id),
  );

  updated.members = updated.members.filter((member) => member.userId !== userId);
  updated.onboardingRecords = updated.onboardingRecords.filter((record) => record.userId !== userId);
  updated.falsePositiveReports = updated.falsePositiveReports.filter((report) => report.reporterUserId !== userId);
  updated.temporaryRoles = updated.temporaryRoles.filter((grant) => grant.userId !== userId);
  updated.reminders = updated.reminders.filter((reminder) => reminder.userId !== userId);
  updated.birthdays = updated.birthdays.filter((birthday) => birthday.userId !== userId);
  updated.scheduledTasks = updated.scheduledTasks.filter((task) => {
    if (task.type === 'reminder' && removedReminderIds.has(task.targetId)) return false;
    if (task.type === 'temprole_expiry' && removedTemporaryRoleIds.has(task.targetId)) return false;
    return true;
  });

  updated.moderationCases = updated.moderationCases.map((record) => {
    const targetMatches = record.targetUserId === userId;
    const moderatorMatches = record.moderatorUserId === userId;
    if (!targetMatches && !moderatorMatches) return record;
    return {
      ...record,
      targetUserId: targetMatches ? '' : record.targetUserId,
      targetUsername: targetMatches ? ANONYMIZED_NAME : record.targetUsername,
      moderatorUserId: moderatorMatches ? '' : record.moderatorUserId,
      moderatorUsername: moderatorMatches ? ANONYMIZED_NAME : record.moderatorUsername,
      reason: targetMatches ? REMOVED_CONTENT : record.reason,
      discordError: targetMatches || moderatorMatches ? null : record.discordError,
    };
  });
  updated.warnings = updated.warnings.map((record) =>
    record.userId === userId
      ? { ...record, userId: '', username: ANONYMIZED_NAME, reason: REMOVED_CONTENT }
      : record,
  );
  updated.appeals = updated.appeals.map((record) =>
    record.userId === userId
      ? {
          ...record,
          userId: '',
          username: ANONYMIZED_NAME,
          reason: '',
          reviewNotes: null,
        }
      : record,
  );
  updated.logs = updated.logs.map((entry) => {
    const actorMatches = entry.actorId === userId;
    const targetMatches = entry.targetId === userId;
    if (!actorMatches && !targetMatches) return entry;
    return {
      ...entry,
      actorId: actorMatches ? '' : entry.actorId,
      actorName: actorMatches ? ANONYMIZED_NAME : entry.actorName,
      targetId: targetMatches ? null : entry.targetId,
      targetName: targetMatches ? ANONYMIZED_NAME : entry.targetName,
      summary: 'Audit activity retained after personal identifiers were removed.',
      details: {},
    };
  });

  updated.recruitmentApplications = updated.recruitmentApplications.map((application) => {
    const applicantMatches = application.applicantUserId === userId;
    const reviewerMatches = application.reviewerUserId === userId;
    if (!applicantMatches && !reviewerMatches) return application;
    return {
      ...application,
      applicantUserId: applicantMatches ? '' : application.applicantUserId,
      applicantUsername: applicantMatches ? ANONYMIZED_NAME : application.applicantUsername,
      answers: applicantMatches ? {} : application.answers,
      reviewerUserId: reviewerMatches ? null : application.reviewerUserId,
      reviewerUsername: reviewerMatches ? null : application.reviewerUsername,
      reviewNotes: applicantMatches || reviewerMatches ? null : application.reviewNotes,
    };
  });
  updated.tickets = updated.tickets.map((ticket) => {
    const creatorMatches = ticket.creatorUserId === userId;
    const claimantMatches = ticket.claimedByUserId === userId;
    const authoredMessages = ticket.messages.some((message) => message.authorId === userId);
    if (!creatorMatches && !claimantMatches && !authoredMessages) return ticket;
    return {
      ...ticket,
      creatorUserId: creatorMatches ? '' : ticket.creatorUserId,
      creatorUsername: creatorMatches ? ANONYMIZED_NAME : ticket.creatorUsername,
      claimedByUserId: claimantMatches ? null : ticket.claimedByUserId,
      claimedByUsername: claimantMatches ? null : ticket.claimedByUsername,
      subject: creatorMatches ? 'Content removed by author request' : ticket.subject,
      feedbackRating: creatorMatches ? null : ticket.feedbackRating,
      feedbackComment: creatorMatches ? null : ticket.feedbackComment,
      messages: ticket.messages.map((message) =>
        message.authorId === userId
          ? { ...message, authorId: '', authorName: ANONYMIZED_NAME, content: '' }
          : message,
      ),
    };
  });
  updated.suggestions = updated.suggestions.map((suggestion) => {
    const authorMatches = suggestion.authorId === userId;
    const upvotes = suggestion.upvotes.filter((id) => id !== userId);
    const downvotes = suggestion.downvotes.filter((id) => id !== userId);
    if (!authorMatches && upvotes.length === suggestion.upvotes.length && downvotes.length === suggestion.downvotes.length) {
      return suggestion;
    }
    return {
      ...suggestion,
      authorId: authorMatches ? '' : suggestion.authorId,
      authorName: authorMatches ? ANONYMIZED_NAME : suggestion.authorName,
      title: authorMatches ? 'Content removed by author request' : suggestion.title,
      description: authorMatches ? '' : suggestion.description,
      upvotes,
      downvotes,
    };
  });
  updated.polls = updated.polls.map((poll) => ({
    ...poll,
    options: poll.options.map((option) => ({
      ...option,
      voterIds: option.voterIds.filter((id) => id !== userId),
    })),
  }));
  updated.giveaways = updated.giveaways.map((giveaway) => ({
    ...giveaway,
    entrants: giveaway.entrants.filter((id) => id !== userId),
    winnerIds: giveaway.winnerIds.filter((id) => id !== userId),
  }));
  updated.events = updated.events.map((event) => ({
    ...event,
    rsvps: event.rsvps.filter((rsvp) => rsvp.userId !== userId),
  }));
  updated.teams = updated.teams.map((team) =>
    team.leaderUserId === userId
      ? {
          ...team,
          leaderUserId: '',
          leaderUsername: ANONYMIZED_NAME,
          description: '',
          memberIds: team.memberIds.filter((id) => id !== userId),
        }
      : { ...team, memberIds: team.memberIds.filter((id) => id !== userId) },
  );
  updated.raidSchedules = updated.raidSchedules.map((raid) => ({
    ...raid,
    attendance: raid.attendance.filter((entry) => entry.userId !== userId),
  }));

  return updated;
}
