from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse


class UserProfileEditViewTests(TestCase):
	def setUp(self):
		self.user_model = get_user_model()
		self.owner = self.user_model.objects.create_user(
			account_id='owner',
			password='testpass123',
		)
		self.other_user = self.user_model.objects.create_user(
			account_id='other',
			password='testpass123',
			email='other@example.com',
		)

	def test_owner_can_update_email_from_profile_edit(self):
		self.client.force_login(self.owner)

		response = self.client.post(
			reverse('user_profile:user_edit', args=[self.owner.id]),
			{
				'bio': 'updated bio',
				'email': 'OWNER@Example.com ',
				'notify_room_create': 'on',
			},
		)

		self.assertRedirects(response, reverse('user_profile:user_top', args=[self.owner.id]))

		self.owner.refresh_from_db()
		self.assertEqual(self.owner.email, 'owner@example.com')
		self.assertTrue(self.owner.notify_room_create)
		self.assertEqual(self.owner.profile.bio, 'updated bio')

		top_response = self.client.get(
			reverse('user_profile:user_top', args=[self.owner.id]),
		)
		self.assertContains(top_response, 'メールアドレス: owner@example.com')

	def test_non_owner_cannot_update_someone_else_profile(self):
		self.client.force_login(self.other_user)

		response = self.client.post(
			reverse('user_profile:user_edit', args=[self.owner.id]),
			{
				'bio': 'forbidden update',
				'email': 'hijack@example.com',
			},
		)

		self.assertEqual(response.status_code, 403)

		self.owner.refresh_from_db()
		self.assertIsNone(self.owner.email)
