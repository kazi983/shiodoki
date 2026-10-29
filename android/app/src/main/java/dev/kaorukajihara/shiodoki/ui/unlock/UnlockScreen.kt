package dev.kaorukajihara.shiodoki.ui.unlock

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.crypto.KeyState
import dev.kaorukajihara.shiodoki.crypto.SecretKind
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors

/** Unlock once per phone (plan Q11, Q13), or say why it cannot be done yet. */
@Composable
fun UnlockScreen(viewModel: UnlockViewModel) {
  val keyState by viewModel.keyState.collectAsStateWithLifecycle()
  val account by viewModel.account.collectAsStateWithLifecycle()

  Scaffold { padding ->
    Box(Modifier.fillMaxSize().padding(padding).imePadding()) {
      when (keyState) {
        KeyState.Locked -> UnlockForm(viewModel, account?.email.orEmpty())
        KeyState.NoKeys -> Notice(
          title = stringResource(R.string.unlock_no_keys_title),
          body = stringResource(R.string.unlock_no_keys_body),
          viewModel = viewModel,
        )
        KeyState.Unreachable -> Notice(
          title = stringResource(R.string.unlock_offline_title),
          body = stringResource(R.string.unlock_offline_body),
          viewModel = viewModel,
        )
        // Checking, or about to leave this screen.
        else -> CircularProgressIndicator(color = ShiodokiColors.Accent, modifier = Modifier.align(Alignment.Center))
      }
    }
  }
}

@Composable
private fun UnlockForm(viewModel: UnlockViewModel, email: String) {
  var visible by rememberSaveable { mutableStateOf(false) }
  val label = stringResource(
    if (viewModel.kind == SecretKind.PASSPHRASE) R.string.unlock_passphrase else R.string.unlock_recovery_key,
  )
  Column(
    modifier = Modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(start = 24.dp, end = 24.dp, top = 48.dp, bottom = 32.dp),
    verticalArrangement = Arrangement.spacedBy(20.dp),
  ) {
    Header(stringResource(R.string.unlock_title), stringResource(R.string.unlock_body))
    Text(email, fontSize = 13.sp, color = ShiodokiColors.TextMuted)

    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      KindButton(stringResource(R.string.unlock_passphrase), viewModel.kind == SecretKind.PASSPHRASE) {
        viewModel.selectKind(SecretKind.PASSPHRASE)
      }
      KindButton(stringResource(R.string.unlock_recovery_key), viewModel.kind == SecretKind.RECOVERY_KEY) {
        viewModel.selectKind(SecretKind.RECOVERY_KEY)
      }
    }

    val error = when {
      !viewModel.wrong -> null
      viewModel.kind == SecretKind.PASSPHRASE -> stringResource(R.string.unlock_wrong_passphrase)
      else -> stringResource(R.string.unlock_wrong_recovery_key)
    }
    OutlinedTextField(
      value = viewModel.secret,
      onValueChange = viewModel::onSecretChange,
      label = { Text(label) },
      singleLine = true,
      isError = error != null,
      supportingText = error?.let { { Text(it) } },
      visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
      keyboardOptions = KeyboardOptions(
        keyboardType = KeyboardType.Password,
        capitalization = KeyboardCapitalization.None,
        autoCorrectEnabled = false,
        imeAction = ImeAction.Done,
      ),
      keyboardActions = KeyboardActions(onDone = { viewModel.unlock() }),
      trailingIcon = {
        TextButton(onClick = { visible = !visible }) {
          Text(
            stringResource(if (visible) R.string.unlock_hide else R.string.unlock_show),
            color = ShiodokiColors.AccentLight,
          )
        }
      },
      textStyle = TextStyle(fontSize = 16.sp),
      shape = RoundedCornerShape(12.dp),
      colors = OutlinedTextFieldDefaults.colors(
        focusedContainerColor = ShiodokiColors.Surface,
        unfocusedContainerColor = ShiodokiColors.Surface,
        errorContainerColor = ShiodokiColors.Surface,
        focusedTextColor = ShiodokiColors.TextStrong,
        unfocusedTextColor = ShiodokiColors.TextStrong,
        unfocusedBorderColor = ShiodokiColors.Outline,
        focusedBorderColor = ShiodokiColors.Accent,
        cursorColor = ShiodokiColors.Accent,
      ),
      modifier = Modifier.fillMaxWidth(),
    )

    PrimaryButton(
      text = stringResource(R.string.unlock_button),
      busy = viewModel.busy,
      enabled = viewModel.secret.isNotEmpty(),
      onClick = viewModel::unlock,
    )
    SignOutButton(viewModel, enabled = !viewModel.busy)
  }
}

/** No keys yet, or the keys could not be read: retry or sign out. */
@Composable
private fun Notice(title: String, body: String, viewModel: UnlockViewModel) {
  Column(
    modifier = Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = 48.dp, bottom = 32.dp),
    verticalArrangement = Arrangement.spacedBy(20.dp),
  ) {
    Header(title, body)
    Column(Modifier.weight(1f)) {}
    PrimaryButton(stringResource(R.string.retry), busy = false, enabled = true, onClick = viewModel::retry)
    SignOutButton(viewModel, enabled = true)
  }
}

@Composable
private fun Header(title: String, body: String) {
  Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
    Text(title, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = ShiodokiColors.TextStrong)
    Text(body, fontSize = 15.sp, lineHeight = 24.sp, color = ShiodokiColors.TextMuted)
  }
}

@Composable
private fun RowScope.KindButton(text: String, isSelected: Boolean, onClick: () -> Unit) {
  OutlinedButton(
    onClick = onClick,
    shape = RoundedCornerShape(12.dp),
    border = BorderStroke(1.dp, if (isSelected) ShiodokiColors.Accent else ShiodokiColors.Outline),
    colors = ButtonDefaults.outlinedButtonColors(
      containerColor = if (isSelected) ShiodokiColors.SurfaceRaised else ShiodokiColors.Background,
      contentColor = if (isSelected) ShiodokiColors.TextStrong else ShiodokiColors.Text,
    ),
    contentPadding = PaddingValues(0.dp),
    modifier = Modifier
      .weight(1f)
      .height(48.dp)
      .semantics {
        role = Role.Tab
        selected = isSelected
      },
  ) {
    Text(text, fontSize = 14.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal, maxLines = 1)
  }
}

@Composable
private fun PrimaryButton(text: String, busy: Boolean, enabled: Boolean, onClick: () -> Unit) {
  Button(
    onClick = onClick,
    enabled = enabled && !busy,
    shape = RoundedCornerShape(16.dp),
    colors = ButtonDefaults.buttonColors(
      containerColor = ShiodokiColors.Accent,
      contentColor = ShiodokiColors.OnAccent,
      disabledContainerColor = ShiodokiColors.Accent.copy(alpha = 0.5f),
      disabledContentColor = ShiodokiColors.OnAccent,
    ),
    modifier = Modifier.fillMaxWidth().height(56.dp),
  ) {
    if (busy) {
      // PBKDF2 takes a second or two.
      CircularProgressIndicator(color = ShiodokiColors.OnAccent, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
    } else {
      Text(text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
    }
  }
}

@Composable
private fun SignOutButton(viewModel: UnlockViewModel, enabled: Boolean) {
  TextButton(onClick = viewModel::signOut, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
    Text(stringResource(R.string.logout), color = ShiodokiColors.TextMuted)
  }
}
