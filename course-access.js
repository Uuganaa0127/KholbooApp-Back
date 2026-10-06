export const premiumMember = (user) => user?.active && user.memberLevel === 'premium';
export const ownsCourse = (data, user, course) =>
  !course.premium ||
  (!!user &&
    (user.role === 'admin' ||
      premiumMember(user) ||
      (data.purchases?.[user.id] || []).includes(course.id)));
