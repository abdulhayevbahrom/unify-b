export const teachers = [
  {
    id: 'teacher_1',
    fullName: 'Ali Karimov',
    subject: 'IT',
    phone: '+998 90 123 45 67',
    status: 'active',
  },
  {
    id: 'teacher_2',
    fullName: 'Madina Usmonova',
    subject: 'Ingliz tili',
    phone: '+998 91 222 33 44',
    status: 'active',
  },
];

export const groups = [
  {
    id: 'group_1',
    name: 'Frontend N15',
    subject: 'IT',
    teacherId: 'teacher_1',
    status: 'active',
  },
  {
    id: 'group_2',
    name: 'English A2',
    subject: 'Ingliz tili',
    teacherId: 'teacher_2',
    status: 'active',
  },
];

export const students = [
  {
    id: 'student_1',
    fullName: 'Sardor Valiyev',
    phone: '+998 93 777 88 99',
    groupId: 'group_1',
    paymentStatus: 'paid',
  },
  {
    id: 'student_2',
    fullName: 'Zarina Tursunova',
    phone: '+998 94 111 22 33',
    groupId: 'group_2',
    paymentStatus: 'debt',
  },
];
