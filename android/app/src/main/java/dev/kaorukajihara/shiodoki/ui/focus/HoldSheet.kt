package dev.kaorukajihara.shiodoki.ui.focus

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.focus.MAX_HOLD_HALF_HOURS
import dev.kaorukajihara.shiodoki.focus.MIN_HOLD_REASON_LENGTH
import dev.kaorukajihara.shiodoki.ui.theme.MonoFamily
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors
import kotlin.math.abs
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

private val HOURS = (0..MAX_HOLD_HALF_HOURS / 2).map { it.toString() }
private val MINUTES = listOf("00", "30")
private val WHEEL_ITEM_HEIGHT = 44.dp

/** Rows shown by a wheel; the middle one is the choice. */
private const val WHEEL_ROWS = 5

/**
 * "フォーカス画面を一時停止" (M-20, design §5.7): a duration from two wheels and a reason typed every
 * time. Closing it any other way than "一時停止" leaves the focus screen as it was.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HoldSheet(viewModel: FocusViewModel) {
  ModalBottomSheet(
    onDismissRequest = viewModel::closeHoldSheet,
    sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    containerColor = ShiodokiColors.Surface,
    contentColor = ShiodokiColors.Text,
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .navigationBarsPadding()
        .padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
      verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
          stringResource(R.string.hold_sheet_title),
          fontSize = 20.sp,
          fontWeight = FontWeight.Bold,
          color = ShiodokiColors.TextStrong,
        )
        Text(stringResource(R.string.hold_sheet_subtitle), fontSize = 13.sp, color = ShiodokiColors.TextMuted)
      }

      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FieldLabel(stringResource(R.string.hold_duration))
        val halfHours = viewModel.holdHalfHours
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .background(ShiodokiColors.Background, RoundedCornerShape(16.dp)),
          contentAlignment = Alignment.Center,
        ) {
          // The band behind the chosen row.
          Box(
            Modifier
              .fillMaxWidth()
              .padding(horizontal = 12.dp)
              .height(WHEEL_ITEM_HEIGHT)
              .background(ShiodokiColors.NavIndicator, RoundedCornerShape(12.dp)),
          )
          Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Wheel(
              values = HOURS,
              selected = halfHours / 2,
              onSelected = { viewModel.setHoldTime(it, halfHours % 2 * 30) },
              modifier = Modifier.width(80.dp),
            )
            UnitLabel(stringResource(R.string.hold_hours_unit))
            Wheel(
              values = MINUTES,
              selected = halfHours % 2,
              onSelected = { viewModel.setHoldTime(halfHours / 2, it * 30) },
              modifier = Modifier.width(64.dp),
            )
            UnitLabel(stringResource(R.string.hold_minutes_unit))
          }
        }
      }

      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row {
          FieldLabel(stringResource(R.string.hold_reason), Modifier.weight(1f))
          Text(
            stringResource(R.string.hold_reason_hint, MIN_HOLD_REASON_LENGTH),
            fontSize = 12.sp,
            color = if (viewModel.canHold) ShiodokiColors.Synced else ShiodokiColors.TextMuted,
          )
        }
        OutlinedTextField(
          value = viewModel.holdReason,
          onValueChange = viewModel::onHoldReasonChange,
          placeholder = { Text(stringResource(R.string.hold_reason_placeholder), color = ShiodokiColors.TextMuted) },
          singleLine = true,
          keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
          textStyle = TextStyle(fontSize = 15.sp),
          shape = RoundedCornerShape(12.dp),
          colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = ShiodokiColors.Background,
            unfocusedContainerColor = ShiodokiColors.Background,
            focusedTextColor = ShiodokiColors.TextStrong,
            unfocusedTextColor = ShiodokiColors.TextStrong,
            unfocusedBorderColor = ShiodokiColors.Outline,
            focusedBorderColor = ShiodokiColors.Accent,
            cursorColor = ShiodokiColors.Accent,
          ),
          modifier = Modifier.fillMaxWidth(),
        )
      }

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
      ) {
        TextButton(onClick = viewModel::closeHoldSheet, modifier = Modifier.height(48.dp)) {
          Text(stringResource(R.string.cancel), fontWeight = FontWeight.Bold, color = ShiodokiColors.AccentLight)
        }
        Button(
          onClick = viewModel::hold,
          enabled = viewModel.canHold,
          colors = ButtonDefaults.buttonColors(
            containerColor = ShiodokiColors.Accent,
            contentColor = ShiodokiColors.OnAccent,
            disabledContainerColor = ShiodokiColors.Divider,
            disabledContentColor = ShiodokiColors.Ended,
          ),
          modifier = Modifier.height(48.dp),
        ) {
          Text(stringResource(R.string.hold_confirm), fontWeight = FontWeight.Bold)
        }
      }
    }
  }
}

@Composable
private fun FieldLabel(text: String, modifier: Modifier = Modifier) {
  Text(text, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ShiodokiColors.TextMuted, modifier = modifier)
}

@Composable
private fun UnitLabel(text: String) {
  Text(text, fontSize = 15.sp, color = ShiodokiColors.Text)
}

/**
 * A scroll wheel that snaps a row to the middle. Reports the middle row once scrolling stops, and
 * follows [selected] when it changes from outside (0 h 0 min corrected to 30 min). A tap on a row
 * scrolls it to the middle.
 */
@Composable
private fun Wheel(values: List<String>, selected: Int, onSelected: (Int) -> Unit, modifier: Modifier = Modifier) {
  val state = rememberLazyListState(initialFirstVisibleItemIndex = selected)
  val scope = rememberCoroutineScope()
  val currentOnSelected by rememberUpdatedState(onSelected)
  val centered by remember { derivedStateOf { state.centeredIndex() } }

  LaunchedEffect(state) {
    snapshotFlow { state.isScrollInProgress }
      .filter { !it }
      .collect { state.centeredIndex()?.let { currentOnSelected(it) } }
  }
  LaunchedEffect(selected) {
    if (!state.isScrollInProgress && state.centeredIndex() != selected) state.animateScrollToItem(selected)
  }

  LazyColumn(
    state = state,
    flingBehavior = rememberSnapFlingBehavior(state, SnapPosition.Center),
    // Room for the first and last rows to reach the middle.
    contentPadding = PaddingValues(vertical = WHEEL_ITEM_HEIGHT * (WHEEL_ROWS / 2)),
    horizontalAlignment = Alignment.CenterHorizontally,
    modifier = modifier.height(WHEEL_ITEM_HEIGHT * WHEEL_ROWS),
  ) {
    itemsIndexed(values) { index, value ->
      val distance = abs(index - (centered ?: selected))
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .height(WHEEL_ITEM_HEIGHT)
          .clickable(role = Role.Button) { scope.launch { state.animateScrollToItem(index) } },
        contentAlignment = Alignment.Center,
      ) {
        Text(
          value,
          fontFamily = MonoFamily,
          fontWeight = FontWeight.Medium,
          fontSize = when (distance) {
            0 -> 22.sp
            1 -> 17.sp
            else -> 15.sp
          },
          color = when (distance) {
            0 -> ShiodokiColors.TextStrong
            1 -> ShiodokiColors.TextMuted
            else -> ShiodokiColors.OutlineInactive
          },
        )
      }
    }
  }
}

/** The row closest to the middle of the wheel, or null before the first layout. */
private fun LazyListState.centeredIndex(): Int? {
  val info = layoutInfo
  val center = (info.viewportStartOffset + info.viewportEndOffset) / 2
  return info.visibleItemsInfo.minByOrNull { abs(it.offset + it.size / 2 - center) }?.index
}
