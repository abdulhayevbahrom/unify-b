import { CashClosure } from '../models/cash-closure.model.js';
import { Notification } from '../models/notification.model.js';

function toCashClosureResponse(closure) {
  const data = closure.toJSON();
  const totalsByMethod = data.totalsByMethod instanceof Map ? Object.fromEntries(data.totalsByMethod) : data.totalsByMethod || {};

  return {
    ...data,
    totalsByMethod,
  };
}

export async function getNotifications(req, res) {
  try {
    const filter = req.user.role === 'owner'
      ? { role: 'owner', status: 'unread' }
      : { role: req.user.role, status: 'unread' };
    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(30);
    const closureIds = notifications
      .filter((notification) => notification.type === 'cash_closure' && notification.relatedId)
      .map((notification) => notification.relatedId);
    const closures = await CashClosure.find({ _id: { $in: closureIds } });
    const closureMap = new Map(closures.map((closure) => [closure._id.toString(), closure]));

    return res.json({
      data: notifications.map((notification) => ({
        ...notification.toJSON(),
        closure: notification.relatedId && closureMap.has(notification.relatedId.toString())
          ? toCashClosureResponse(closureMap.get(notification.relatedId.toString()))
          : null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Bildirishnomalarni olishda xatolik', error: error.message });
  }
}

export async function markNotificationRead(req, res) {
  try {
    const notification = await Notification.findById(req.params.notificationId);

    if (!notification) {
      return res.status(404).json({ message: 'Bildirishnoma topilmadi' });
    }

    if (req.user.role !== 'owner' && notification.role !== req.user.role) {
      return res.status(403).json({ message: 'Bu bildirishnoma uchun ruxsat yo‘q' });
    }

    notification.status = 'read';
    await notification.save();

    return res.json(notification);
  } catch (error) {
    return res.status(400).json({ message: 'Bildirishnomani yangilashda xatolik', error: error.message });
  }
}
